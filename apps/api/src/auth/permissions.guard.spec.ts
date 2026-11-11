import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, permissionsFor } from '@onepay/shared';
import { PermissionsGuard } from './permissions.guard';

function ctx(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  it('allows routes without permission metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it('allows when every required permission is granted', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.OUTLET_MANAGE]);
    expect(guard.canActivate(ctx({ permissions: permissionsFor('OWNER', null) }))).toBe(true);
  });

  it('forbids when a permission is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.OUTLET_MANAGE]);
    expect(() => guard.canActivate(ctx({ permissions: permissionsFor('CASHIER', null) }))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids anonymous requests on protected routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.COMPANY_READ]);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
