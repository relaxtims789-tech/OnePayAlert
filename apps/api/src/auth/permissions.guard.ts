import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermissions, type Permission } from '@onepay/shared';
import { PERMISSIONS_KEY, type AuthedRequest } from '../common/decorators';

/** Enforces @RequirePermissions(...) using the principal resolved by JwtAuthGuard. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!user || !hasPermissions(user.permissions, required)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
