import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, type AuthedRequest } from '../common/decorators';
import { PrincipalService } from './principal.service';

/**
 * Verifies the bearer access token and resolves the principal (revalidated against the
 * database, with a version-invalidated Redis cache), so disabled users, revoked sessions,
 * removed memberships and suspended companies lose access immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly principals: PrincipalService,
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
    req.user = await this.principals.resolve(await this.principals.verifyToken(token));
    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
