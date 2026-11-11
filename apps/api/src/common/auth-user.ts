import type { CompanyRole, Permission, PlatformRole } from '@onepay/shared';

/** The authenticated principal attached to every request after JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  sessionId: string;
  /** Active tenant. All tenant data access MUST be scoped by this id. */
  companyId: string | null;
  companyRole: CompanyRole | null;
  platformRole: PlatformRole | null;
  permissions: Permission[];
  /** Outlets the member is restricted to. Empty = all outlets in the company. */
  outletIds: string[];
}

/** AuthUser that is guaranteed to be acting inside a tenant. */
export interface TenantUser extends AuthUser {
  companyId: string;
  companyRole: CompanyRole;
}
