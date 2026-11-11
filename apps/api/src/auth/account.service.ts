import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/app-config.service';
import { MailService, passwordResetEmail } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordDto, UpdateProfileDto } from './dto';
import { PasswordService } from './password.service';
import { PrincipalService } from './principal.service';

const RESET_TTL_MS = 30 * 60_000;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Self-service account operations: profile, password change, password reset. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly principals: PrincipalService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: dto });
  }

  /** Changes the password and signs out every other session of the user. */
  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto, ip: string | null): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // 400, not 401: a 401 must always mean "session invalid" so clients can sign the user out.
    if (!(await this.passwords.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.principals.invalidateUser(userId);
    await this.audit.log({
      companyId: null,
      actorUserId: userId,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: userId,
      ipAddress: ip,
    });
  }

  /** Always succeeds from the caller's point of view, so emails cannot be enumerated. */
  async forgotPassword(email: string, ip: string | null): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'DISABLED') return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Only the newest link works.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
          requestedIp: ip,
        },
      }),
    ]);
    const link = `${this.config.get('WEB_APP_URL')}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.mail.send({ to: user.email, ...passwordResetEmail(user.locale, user.fullName, link) });
    } catch (e) {
      this.logger.error(`Password reset email failed: ${(e as Error).message}`);
    }
  }

  async resetPassword(token: string, newPassword: string, ip: string | null): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('This reset link is invalid or has expired');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.principals.invalidateUser(record.userId);
    await this.audit.log({
      companyId: null,
      actorUserId: record.userId,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: record.userId,
      ipAddress: ip,
    });
  }
}
