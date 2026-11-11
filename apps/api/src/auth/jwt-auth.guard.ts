import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  CompanyRole,
  Permission,
  PlatformRole,
  permissionsFor,
  type AccessTokenClaims,
} from '@onepay/shared';
import type { AuthUser } from '../common/auth-user';
import { IS_PUBLIC_KEY, type AuthedRequest } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Verifies the bearer access token and re-validates the principal against the database
 * on every request, so disabled users, revoked sessions, removed memberships and
 * suspended companies lose access immediately (not only when the token expires).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractBearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims & object>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = await this.loadPrincipal(claims);
    return true;
  }

  private async loadPrincipal(claims: AccessTokenClaims): Promise<AuthUser> {
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
        throw new ForbiddenException('This company account is suspended. Contact CAM support.');
      }
      companyRole = membership.role as CompanyRole;
      outletIds = membership.outlets.map((o) => o.outletId);
    }

    return {
      userId: claims.sub,
      sessionId: claims.sid,
      companyId: claims.cid,
      companyRole,
      platformRole,
      permissions: permissionsFor(companyRole, platformRole) as Permission[],
      outletIds,
    };
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
