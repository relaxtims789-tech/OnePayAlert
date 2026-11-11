/**
 * Domain enums shared by the API, web dashboards and (mirrored in Dart) the mobile app.
 * Values MUST stay in sync with the Prisma schema enums in apps/api/prisma/schema.prisma.
 */

export const CompanyRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  CASHIER: 'CASHIER',
} as const;
export type CompanyRole = (typeof CompanyRole)[keyof typeof CompanyRole];

export const PlatformRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SUPPORT: 'SUPPORT',
} as const;
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export const CompanyStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
} as const;
export type CompanyStatus = (typeof CompanyStatus)[keyof typeof CompanyStatus];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const TransactionStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED',
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const Locale = {
  KM: 'km',
  EN: 'en',
  ZH: 'zh',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
export const SUPPORTED_LOCALES: readonly Locale[] = [Locale.KM, Locale.EN, Locale.ZH];

/** Runtime environment. Fake/simulated payments are only ever allowed outside PRODUCTION. */
export const AppEnvironment = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  DEMO: 'demo',
  PRODUCTION: 'production',
} as const;
export type AppEnvironment = (typeof AppEnvironment)[keyof typeof AppEnvironment];
