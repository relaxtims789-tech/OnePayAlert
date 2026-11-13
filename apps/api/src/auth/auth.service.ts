import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  permissionsFor,
  type AuthTokens,
  type CompanyRole,
  type Locale,
  type MeResponse,
  type PlatformRole,
} from '@onepay/shared';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/app-config.service';
import { MailService, accountLockedEmail } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto, RegisterMerchantDto } from './dto';
import { LoginLockoutService } from './login-lockout.service';
import { PasswordService } from './password.service';
import { PrincipalService } from './principal.service';
import { TokenService } from './token.service';

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

const TRIAL_DAYS = 14;
/** How long an already-rotated refresh token is accepted as a lost-response retry. */
export const REFRESH_REUSE_GRACE_MS = 30_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Pre-computed hash used to equalise timing when the email does not exist. */
  private dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly principals: PrincipalService,
    private readonly lockout: LoginLockoutService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {
    this.dummyHash = this.passwords.hash('timing-equaliser-password-0');
  }

  /** Self-service merchant sign-up: user + company + owner membership + main outlet + trial. */
  async registerMerchant(dto: RegisterMerchantDto, client: ClientInfo): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await this.passwords.hash(dto.password);
    const refresh = this.tokens.newRefreshToken();

    const { user, company, session } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          passwordHash,
          locale: dto.locale ?? 'km',
        },
      });
      const company = await tx.company.create({
        data: {
          name: dto.companyName,
          email: dto.email,
          phone: dto.phone ?? null,
          defaultCurrency: dto.defaultCurrency ?? 'USD',
          status: 'ACTIVE',
        },
      });
      await tx.membership.create({
        data: { companyId: company.id, userId: user.id, role: 'OWNER' },
      });
      await tx.outlet.create({
        data: { companyId: company.id, name: 'Main Outlet', code: 'MAIN' },
      });

      const starter = await tx.plan.findUnique({ where: { code: 'STARTER' } });
      if (starter) {
        const now = new Date();
        const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
        await tx.subscription.create({
          data: {
            companyId: company.id,
            planId: starter.id,
            status: 'TRIALING',
            currentPeriodStart: now,
            currentPeriodEnd: trialEnd,
            trialEndsAt: trialEnd,
          },
        });
      }

      const session = await tx.session.create({
        data: {
          userId: user.id,
          companyId: company.id,
          refreshTokenHash: refresh.hash,
          userAgent: client.userAgent?.slice(0, 400) ?? null,
          ipAddress: client.ip,
          expiresAt: this.tokens.refreshExpiry(),
        },
      });
      await this.audit.log(
        {
          companyId: company.id,
          actorUserId: user.id,
          action: 'company.registered',
          entityType: 'company',
          entityId: company.id,
          ipAddress: client.ip,
        },
        tx,
      );
      return { user, company, session };
    });

    return this.tokens.issue(
      {
        userId: user.id,
        sessionId: session.id,
        companyId: company.id,
        companyRole: 'OWNER',
        platformRole: null,
      },
      refresh.token,
    );
  }

  async login(dto: LoginDto, client: ClientInfo): Promise<AuthTokens> {
    // Checked before the password: while locked, even the right password is refused.
    await this.lockout.assertNotLocked(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: { company: { select: { status: true } } },
        },
      },
    });

    if (!user) {
      await this.passwords.verify(await this.dummyHash, dto.password);
      return this.wrongPassword(dto.email, null, client);
    }
    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) return this.wrongPassword(dto.email, user, client);
    await this.lockout.clear(dto.email);
    if (user.status === 'DISABLED') throw new ForbiddenException('This account is disabled');

    let membership = dto.companyId
      ? user.memberships.find((m) => m.companyId === dto.companyId)
      : user.memberships[0];
    if (dto.companyId && !membership) {
      throw new ForbiddenException('You are not a member of this company');
    }
    if (!membership && !user.platformRole) {
      throw new ForbiddenException('This account has no active company membership');
    }
    if (membership && ['SUSPENDED', 'CLOSED'].includes(membership.company.status)) {
      if (dto.companyId || !user.platformRole) {
        throw new ForbiddenException('This company account is suspended. Contact MysoftKH support.');
      }
      membership = undefined;
    }

    const tokens = await this.startSession(
      user.id,
      membership?.companyId ?? null,
      (membership?.role as CompanyRole | undefined) ?? null,
      (user.platformRole as PlatformRole | null) ?? null,
      client,
    );
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      companyId: membership?.companyId ?? null,
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: client.ip,
    });
    return tokens;
  }

  /**
   * Counts a wrong password (unknown emails exactly like real ones) and always throws: invalid
   * credentials, or ACCOUNT_LOCKED when this attempt reached the limit. A real account's owner is
   * told by email, and the lock is audited.
   */
  private async wrongPassword(
    email: string,
    user: { id: string; email: string; fullName: string; locale: string; status: string } | null,
    client: ClientInfo,
  ): Promise<never> {
    if (!(await this.lockout.recordFailure(email))) throw new UnauthorizedException('Invalid email or password');
    if (user) {
      await this.audit.log({ companyId: null, actorUserId: user.id, action: 'auth.locked', entityType: 'user', entityId: user.id, ipAddress: client.ip });
      if (user.status !== 'DISABLED') {
        const link = `${this.config.get('WEB_APP_URL')}/forgot-password`;
        try {
          await this.mail.send({ to: user.email, ...accountLockedEmail(user.locale as Locale, user.fullName, this.lockout.lockMinutes, link) });
        } catch (e) {
          this.logger.error(`Account-locked email failed: ${(e as Error).message}`);
        }
      }
    }
    throw this.lockout.lockedError();
  }

  /**
   * Rotates the refresh token. Presenting an already-rotated token is treated as token theft
   * (every session of the user is revoked) — except within a short grace window right after
   * rotation, where it almost always means the client never received the new token (lost
   * response on a flaky network, aborted request). That case gets a fresh session instead of
   * signing the user out everywhere.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<AuthTokens> {
    const hash = TokenService.hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    const withinGrace =
      session.revokedAt !== null &&
      session.replacedById !== null &&
      Date.now() - session.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS;

    if (session.revokedAt && !withinGrace) {
      this.logger.warn(`Refresh token reuse detected for user ${session.userId}; revoking sessions`);
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.principals.invalidateUser(session.userId);
      throw new UnauthorizedException('Refresh token has already been used');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');
    if (session.user.status === 'DISABLED') throw new ForbiddenException('This account is disabled');

    let companyRole: CompanyRole | null = null;
    if (session.companyId) {
      const m = await this.prisma.membership.findUnique({
        where: { companyId_userId: { companyId: session.companyId, userId: session.userId } },
        include: { company: { select: { status: true } } },
      });
      if (!m || !m.isActive) throw new UnauthorizedException('Membership is no longer active');
      if (['SUSPENDED', 'CLOSED'].includes(m.company.status)) {
        throw new ForbiddenException('This company account is suspended. Contact MysoftKH support.');
      }
      companyRole = m.role as CompanyRole;
    }

    const next = this.tokens.newRefreshToken();
    const newSession = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId: session.userId,
          companyId: session.companyId,
          refreshTokenHash: next.hash,
          userAgent: client.userAgent?.slice(0, 400) ?? null,
          ipAddress: client.ip,
          expiresAt: this.tokens.refreshExpiry(),
        },
      });
      if (withinGrace) {
        this.logger.log(`Refresh token re-presented within grace window for user ${session.userId}`);
        return created;
      }
      // Conditional revoke guards against two concurrent refreshes of the same token.
      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
      if (revoked.count !== 1) throw new UnauthorizedException('Refresh token has already been used');
      return created;
    });
    if (!withinGrace) await this.principals.invalidateSession(session.id);

    return this.tokens.issue(
      {
        userId: session.userId,
        sessionId: newSession.id,
        companyId: session.companyId,
        companyRole,
        platformRole: (session.user.platformRole as PlatformRole | null) ?? null,
      },
      next.token,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: TokenService.hashRefreshToken(refreshToken) },
      select: { id: true, revokedAt: true },
    });
    if (!session || session.revokedAt) return;
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await this.principals.invalidateSession(session.id);
  }

  /** Issues a new session scoped to another company the user belongs to. */
  async switchCompany(
    userId: string,
    currentSessionId: string,
    companyId: string,
    client: ClientInfo,
  ): Promise<AuthTokens> {
    const m = await this.prisma.membership.findUnique({
      where: { companyId_userId: { companyId, userId } },
      include: { company: { select: { status: true } }, user: { select: { platformRole: true } } },
    });
    if (!m || !m.isActive) throw new ForbiddenException('You are not a member of this company');
    if (['SUSPENDED', 'CLOSED'].includes(m.company.status)) {
      throw new ForbiddenException('This company account is suspended. Contact MysoftKH support.');
    }
    await this.prisma.session.update({
      where: { id: currentSessionId },
      data: { revokedAt: new Date() },
    });
    await this.principals.invalidateSession(currentSessionId);
    return this.startSession(
      userId,
      companyId,
      m.role as CompanyRole,
      (m.user.platformRole as PlatformRole | null) ?? null,
      client,
    );
  }

  async me(userId: string, companyId: string | null): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: { company: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const active = user.memberships.find((m) => m.companyId === companyId) ?? null;
    const activeRole = (active?.role as CompanyRole | undefined) ?? null;
    const platformRole = (user.platformRole as PlatformRole | null) ?? null;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      locale: user.locale,
      status: user.status,
      platformRole,
      activeCompanyId: active?.companyId ?? null,
      activeRole,
      permissions: permissionsFor(activeRole, platformRole),
      memberships: user.memberships.map((m) => ({
        companyId: m.companyId,
        companyName: m.company.name,
        role: m.role as CompanyRole,
      })),
    };
  }

  private async startSession(
    userId: string,
    companyId: string | null,
    companyRole: CompanyRole | null,
    platformRole: PlatformRole | null,
    client: ClientInfo,
  ): Promise<AuthTokens> {
    const refresh = this.tokens.newRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        companyId,
        refreshTokenHash: refresh.hash,
        userAgent: client.userAgent?.slice(0, 400) ?? null,
        ipAddress: client.ip,
        expiresAt: this.tokens.refreshExpiry(),
      },
    });
    return this.tokens.issue(
      { userId, sessionId: session.id, companyId, companyRole, platformRole },
      refresh.token,
    );
  }
}
