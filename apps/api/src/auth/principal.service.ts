import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  permissionsFor,
  type AccessTokenClaims,
  type CompanyRole,
  type PlatformRole,
} from '@onepay/shared';
import type { AuthUser } from '../common/auth-user';
import { RedisService } from '../infra/redis.service';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_SECONDS = 60;

interface CachedPrincipal {
  principal: AuthUser;
  uv: string;
  cv: string;
  exp: number;
}

/**
 * Resolves an access token into an AuthUser, re-validating session, user, membership and
 * company status. Results are cached in Redis and invalidated through version counters:
 * bumping a user's or company's version makes every cached principal for it stale at once,
 * so revocations still take effect immediately. Redis failures fall back to the database.
 */
@Injectable()
export class PrincipalService {
  private readonly logger = new Logger(PrincipalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
  ) {}

  /** Verifies signature, issuer, audience and expiry of an access token. */
  async verifyToken(token: string): Promise<AccessTokenClaims & { exp: number }> {
    try {
      return await this.jwt.verifyAsync<AccessTokenClaims & { exp: number }>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private sessionKey = (sid: string) => `auth:p:${sid}`;
  private userVerKey = (uid: string) => `auth:v:u:${uid}`;
  private companyVerKey = (cid: string | null) => `auth:v:c:${cid ?? 'none'}`;

  async resolve(claims: AccessTokenClaims): Promise<AuthUser> {
    let versions: [string, string] = ['0', '0'];
    let cacheOk = true;
    try {
      const [raw, uv, cv] = await this.redis.client.mget(
        this.sessionKey(claims.sid),
        this.userVerKey(claims.sub),
        this.companyVerKey(claims.cid),
      );
      versions = [uv ?? '0', cv ?? '0'];
      if (raw) {
        const cached = JSON.parse(raw) as CachedPrincipal;
        if (
          cached.uv === versions[0] &&
          cached.cv === versions[1] &&
          cached.exp > Date.now() &&
          cached.principal.userId === claims.sub &&
          cached.principal.companyId === claims.cid
        ) {
          return cached.principal;
        }
      }
    } catch {
      cacheOk = false;
    }

    const { principal, sessionExpiresAt } = await this.loadFromDb(claims);
    if (cacheOk) {
      const entry: CachedPrincipal = {
        principal,
        uv: versions[0],
        cv: versions[1],
        exp: sessionExpiresAt.getTime(),
      };
      await this.redis.client
        .set(this.sessionKey(claims.sid), JSON.stringify(entry), 'EX', CACHE_TTL_SECONDS)
        .catch(() => undefined);
    }
    return principal;
  }

  /** Drop the cached principal of one session (logout, refresh rotation, company switch). */
  async invalidateSession(sessionId: string): Promise<void> {
    await this.safe(() => this.redis.client.del(this.sessionKey(sessionId)));
  }

  /** Invalidate every cached session of a user (role/outlet change, deactivation, token theft). */
  async invalidateUser(userId: string): Promise<void> {
    await this.safe(() => this.redis.client.incr(this.userVerKey(userId)));
  }

  /** Invalidate every cached session acting in a company (suspension, closure). */
  async invalidateCompany(companyId: string): Promise<void> {
    await this.safe(() => this.redis.client.incr(this.companyVerKey(companyId)));
  }

  private async safe(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      // Bounded staleness: cached entries expire within CACHE_TTL_SECONDS regardless.
      this.logger.error(`Auth cache invalidation failed: ${(e as Error).message}`);
    }
  }

  private async loadFromDb(
    claims: AccessTokenClaims,
  ): Promise<{ principal: AuthUser; sessionExpiresAt: Date }> {
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { status: true, platformRole: true } },
      },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.user.status === 'DISABLED'
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const platformRole = (session.user.platformRole as PlatformRole | null) ?? null;
    let companyRole: CompanyRole | null = null;
    let outletIds: string[] = [];

    if (claims.cid) {
      const membership = await this.prisma.membership.findUnique({
        where: { companyId_userId: { companyId: claims.cid, userId: claims.sub } },
        select: {
          role: true,
          isActive: true,
          company: { select: { status: true } },
          outlets: { select: { outletId: true } },
        },
      });
      if (!membership || !membership.isActive) {
        throw new UnauthorizedException('Membership is no longer active');
      }
      if (membership.company.status === 'SUSPENDED' || membership.company.status === 'CLOSED') {
        throw new ForbiddenException('This company account is suspended. Contact MysoftKH support.');
      }
      companyRole = membership.role as CompanyRole;
      outletIds = membership.outlets.map((o) => o.outletId);
    }

    return {
      principal: {
        userId: claims.sub,
        sessionId: claims.sid,
        companyId: claims.cid,
        companyRole,
        platformRole,
        permissions: permissionsFor(companyRole, platformRole),
        outletIds,
      },
      sessionExpiresAt: session.expiresAt,
    };
  }
}
