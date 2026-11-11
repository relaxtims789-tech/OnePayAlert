import type { CompanyDto } from './api-types';
import type { CompanyRole, CompanyStatus, PlatformRole, UserStatus } from './enums';
import type { Currency } from './money';
import type { BankConnectionStatus, PaymentProviderDto, ProviderType } from './payments';

/** Types for the CAM Super Admin (platform) API. Money is integer minor units. */

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
export type BillingInterval = 'MONTH' | 'YEAR';

export interface PlatformCompanyDto extends CompanyDto {
  outletCount: number;
  employeeCount: number;
  ownerEmail: string | null;
  planCode: string | null;
  subscriptionStatus: SubscriptionStatus | null;
}

export interface CurrencyAmount {
  currency: Currency;
  count: number;
  amountMinor: number;
}

export interface PlatformOverviewDto {
  merchants: { total: number; byStatus: Record<CompanyStatus, number>; newLast30Days: number };
  subscriptions: Record<SubscriptionStatus, number>;
  /** Real (non-simulated) successful payments since the start of today in Asia/Phnom_Penh. */
  paymentsToday: CurrencyAmount[];
  simulatedPaymentsToday: number;
  connections: { active: number; pending: number; error: number };
  webhookEvents: { failedLast24h: number; stuck: number };
  /** New merchants per Phnom Penh day for the last 30 days (YYYY-MM-DD). */
  signupsDaily: { date: string; count: number }[];
  recentMerchants: PlatformCompanyDto[];
}

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  priceMinor: number;
  currency: Currency;
  interval: BillingInterval;
  maxOutlets: number;
  maxEmployees: number;
  maxBankConns: number;
  maxDevices: number;
  isActive: boolean;
  subscriberCount: number;
}

export interface SubscriptionDto {
  id: string;
  status: SubscriptionStatus;
  plan: Pick<PlanDto, 'id' | 'code' | 'name' | 'priceMinor' | 'currency' | 'interval'>;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  canceledAt: string | null;
}

export interface PlatformMemberDto {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: CompanyRole;
  isActive: boolean;
  userStatus: UserStatus;
  lastLoginAt: string | null;
}

export interface PlatformConnectionDto {
  id: string;
  displayName: string;
  providerCode: string;
  providerName: string;
  providerType: ProviderType;
  currency: Currency;
  status: BankConnectionStatus;
  accountNumberMasked: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface PlatformCompanyDetailDto extends PlatformCompanyDto {
  members: PlatformMemberDto[];
  outlets: { id: string; name: string; code: string; isActive: boolean }[];
  connections: PlatformConnectionDto[];
  subscription: SubscriptionDto | null;
  /** Real successful payments in the last 30 days. */
  payments30d: CurrencyAmount[];
  simulatedPayments30d: number;
}

export interface PlatformAuditDto {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  companyId: string | null;
  companyName: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  metadata: unknown;
}

export interface FailedWebhookEventDto {
  id: string;
  companyId: string;
  companyName: string;
  connectionName: string;
  providerCode: string;
  providerEventId: string;
  attempts: number;
  lastError: string | null;
  receivedAt: string;
}

export interface PlatformHealthDto {
  status: 'ok' | 'degraded' | 'error';
  database: 'up' | 'down';
  redis: 'up' | 'down';
  queue: 'up' | 'down';
  queueDriver: 'rabbitmq' | 'inline';
  environment: string;
  webhookEvents: { received: number; stuck: number; failedLast24h: number; processedLast24h: number };
  recentFailures: FailedWebhookEventDto[];
}

export type PlatformProviderDto = PaymentProviderDto & { isActive: boolean; connectionCount: number };

export interface PlatformStaffSummary {
  platformRole: PlatformRole;
}
