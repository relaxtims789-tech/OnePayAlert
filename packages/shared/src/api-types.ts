import type { CompanyRole, CompanyStatus, Locale, PlatformRole, UserStatus } from './enums';
import type { Currency } from './money';
import type { Permission } from './permissions';

/** Payload carried inside access tokens. */
export interface AccessTokenClaims {
  sub: string; // user id
  sid: string; // session id
  cid: string | null; // active company id (tenant)
  crole: CompanyRole | null;
  prole: PlatformRole | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number; // seconds
}

export interface MembershipSummary {
  companyId: string;
  companyName: string;
  role: CompanyRole;
}

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  locale: Locale;
  status: UserStatus;
  platformRole: PlatformRole | null;
  activeCompanyId: string | null;
  activeRole: CompanyRole | null;
  permissions: Permission[];
  memberships: MembershipSummary[];
}

export interface CompanyDto {
  id: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  defaultCurrency: Currency;
  status: CompanyStatus;
  createdAt: string;
}

export interface OutletDto {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface EmployeeDto {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: CompanyRole;
  status: UserStatus;
  isActive: boolean;
  outletIds: string[];
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
}
