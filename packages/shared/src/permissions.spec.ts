import { CompanyRole, PlatformRole } from './enums';
import { ASSIGNABLE_ROLES, Permission, hasPermissions, permissionsFor } from './permissions';

describe('permissions', () => {
  it('gives owners full tenant access but no platform access', () => {
    const perms = permissionsFor(CompanyRole.OWNER, null);
    expect(perms).toContain(Permission.SUBSCRIPTION_MANAGE);
    expect(perms.some((p) => p.startsWith('platform.'))).toBe(false);
  });

  it('keeps cashiers read-only', () => {
    const perms = permissionsFor(CompanyRole.CASHIER, null);
    expect(hasPermissions(perms, [Permission.TRANSACTION_READ])).toBe(true);
    expect(hasPermissions(perms, [Permission.OUTLET_MANAGE])).toBe(false);
    expect(hasPermissions(perms, [Permission.EMPLOYEE_MANAGE])).toBe(false);
  });

  it('prevents admins from managing billing', () => {
    expect(permissionsFor(CompanyRole.ADMIN, null)).not.toContain(Permission.SUBSCRIPTION_MANAGE);
  });

  it('grants platform permissions only via platform roles', () => {
    expect(permissionsFor(null, PlatformRole.SUPER_ADMIN)).toContain(
      Permission.PLATFORM_COMPANIES_MANAGE,
    );
    expect(permissionsFor(null, PlatformRole.SUPPORT)).not.toContain(
      Permission.PLATFORM_COMPANIES_MANAGE,
    );
  });

  it('never lets a role assign an equal or higher role', () => {
    expect(ASSIGNABLE_ROLES.OWNER).not.toContain(CompanyRole.OWNER);
    expect(ASSIGNABLE_ROLES.ADMIN).not.toContain(CompanyRole.ADMIN);
    expect(ASSIGNABLE_ROLES.ADMIN).not.toContain(CompanyRole.OWNER);
  });
});
