import {
  ForbiddenException,
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Permission } from '@onepay/shared';
import type { Request } from 'express';
import type { AuthUser, TenantUser } from './auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as not requiring authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
/** All listed permissions are required. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export type AuthedRequest = Request & { user?: AuthUser };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new ForbiddenException('Not authenticated');
  return req.user;
});

/** Like CurrentUser but guarantees an active tenant (company) context. */
export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  const user = req.user;
  if (!user?.companyId || !user.companyRole) {
    throw new ForbiddenException('No active company selected');
  }
  return user as TenantUser;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.ip ?? null;
});
