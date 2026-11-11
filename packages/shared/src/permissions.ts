import { CompanyRole, PlatformRole } from './enums';

/**
 * Fine-grained permissions. Tenant permissions are granted through a company membership
 * role; platform permissions are granted only to Mysoftkh staff.
 */
export const Permission = {
  // Tenant (merchant) permissions
  COMPANY_READ: 'company.read',
  COMPANY_UPDATE: 'company.update',
  OUTLET_READ: 'outlet.read',
  OUTLET_MANAGE: 'outlet.manage',
  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_MANAGE: 'employee.manage',
  BANK_CONNECTION_READ: 'bank_connection.read',
  BANK_CONNECTION_MANAGE: 'bank_connection.manage',
  TRANSACTION_READ: 'transaction.read',
  DEVICE_READ: 'device.read',
  DEVICE_MANAGE: 'device.manage',
  REPORT_READ: 'report.read',
  SUBSCRIPTION_READ: 'subscription.read',
  SUBSCRIPTION_MANAGE: 'subscription.manage',
  AUDIT_READ: 'audit.read',

  // Platform (MysoftKH Super Admin) permissions
  PLATFORM_COMPANIES_READ: 'platform.companies.read',
  PLATFORM_COMPANIES_MANAGE: 'platform.companies.manage',
  PLATFORM_PROVIDERS_MANAGE: 'platform.providers.manage',
  PLATFORM_PLANS_MANAGE: 'platform.plans.manage',
  PLATFORM_AUDIT_READ: 'platform.audit.read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

const ALL_TENANT: Permission[] = [
  P.COMPANY_READ,
  P.COMPANY_UPDATE,
  P.OUTLET_READ,
  P.OUTLET_MANAGE,
  P.EMPLOYEE_READ,
  P.EMPLOYEE_MANAGE,
  P.BANK_CONNECTION_READ,
  P.BANK_CONNECTION_MANAGE,
  P.TRANSACTION_READ,
  P.DEVICE_READ,
  P.DEVICE_MANAGE,
  P.REPORT_READ,
  P.SUBSCRIPTION_READ,
  P.SUBSCRIPTION_MANAGE,
  P.AUDIT_READ,
];

export const COMPANY_ROLE_PERMISSIONS: Readonly<Record<CompanyRole, readonly Permission[]>> = {
  [CompanyRole.OWNER]: ALL_TENANT,
  // Admin can do everything except manage the subscription (billing stays with the owner).
  [CompanyRole.ADMIN]: ALL_TENANT.filter((p) => p !== P.SUBSCRIPTION_MANAGE),
  [CompanyRole.MANAGER]: [
    P.COMPANY_READ,
    P.OUTLET_READ,
    P.OUTLET_MANAGE,
    P.EMPLOYEE_READ,
    P.BANK_CONNECTION_READ,
    P.TRANSACTION_READ,
    P.DEVICE_READ,
    P.DEVICE_MANAGE,
    P.REPORT_READ,
  ],
  [CompanyRole.ACCOUNTANT]: [
    P.COMPANY_READ,
    P.OUTLET_READ,
    P.BANK_CONNECTION_READ,
    P.TRANSACTION_READ,
    P.REPORT_READ,
    P.SUBSCRIPTION_READ,
  ],
  [CompanyRole.CASHIER]: [P.COMPANY_READ, P.OUTLET_READ, P.TRANSACTION_READ, P.DEVICE_READ],
};

export const PLATFORM_ROLE_PERMISSIONS: Readonly<Record<PlatformRole, readonly Permission[]>> = {
  [PlatformRole.SUPER_ADMIN]: [
    P.PLATFORM_COMPANIES_READ,
    P.PLATFORM_COMPANIES_MANAGE,
    P.PLATFORM_PROVIDERS_MANAGE,
    P.PLATFORM_PLANS_MANAGE,
    P.PLATFORM_AUDIT_READ,
  ],
  [PlatformRole.SUPPORT]: [P.PLATFORM_COMPANIES_READ, P.PLATFORM_AUDIT_READ],
};

/** Roles a member with `actor` role may assign to other employees (no privilege escalation). */
export const ASSIGNABLE_ROLES: Readonly<Record<CompanyRole, readonly CompanyRole[]>> = {
  [CompanyRole.OWNER]: [
    CompanyRole.ADMIN,
    CompanyRole.MANAGER,
    CompanyRole.ACCOUNTANT,
    CompanyRole.CASHIER,
  ],
  [CompanyRole.ADMIN]: [CompanyRole.MANAGER, CompanyRole.ACCOUNTANT, CompanyRole.CASHIER],
  [CompanyRole.MANAGER]: [],
  [CompanyRole.ACCOUNTANT]: [],
  [CompanyRole.CASHIER]: [],
};

export function permissionsFor(
  companyRole: CompanyRole | null | undefined,
  platformRole: PlatformRole | null | undefined,
): Permission[] {
  const set = new Set<Permission>();
  if (companyRole) COMPANY_ROLE_PERMISSIONS[companyRole].forEach((p) => set.add(p));
  if (platformRole) PLATFORM_ROLE_PERMISSIONS[platformRole].forEach((p) => set.add(p));
  return [...set];
}

export function hasPermissions(granted: readonly string[], required: readonly Permission[]): boolean {
  return required.every((p) => granted.includes(p));
}
