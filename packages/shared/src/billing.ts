import type { Currency } from './money';
import type { BillingInterval, PlanDto, SubscriptionDto } from './platform';

export type InvoiceStatus = 'OPEN' | 'PAID' | 'VOID';
/** NEW = first paid period, RENEWAL = next period of the same plan, PLAN_CHANGE = switch plan. */
export type InvoiceKind = 'NEW' | 'RENEWAL' | 'PLAN_CHANGE';
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'OTHER';

/** Plan-limited resources. */
export type PlanResource = 'outlets' | 'employees' | 'bankConnections' | 'devices';

/** Days an unpaid renewal stays usable (PAST_DUE) before the subscription expires. */
export const BILLING_GRACE_DAYS = 7;
/** Days a merchant has to pay a newly issued invoice. */
export const INVOICE_DUE_DAYS = 7;

export interface UsageItem {
  used: number;
  limit: number;
}
export type PlanUsage = Record<PlanResource, UsageItem>;

export interface InvoiceDto {
  id: string;
  number: string;
  companyId: string;
  companyName?: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  plan: Pick<PlanDto, 'id' | 'code' | 'name'>;
  amountMinor: number;
  currency: Currency;
  interval: BillingInterval;
  dueAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  createdAt: string;
}

/** GET /billing — everything the merchant's Billing page needs. */
export interface BillingOverviewDto {
  subscription: SubscriptionDto | null;
  /** True while the merchant may add plan-limited resources (TRIALING, ACTIVE or PAST_DUE). */
  canAddResources: boolean;
  usage: PlanUsage;
  limits: Pick<PlanDto, 'maxOutlets' | 'maxEmployees' | 'maxBankConns' | 'maxDevices'> | null;
  openInvoice: InvoiceDto | null;
  /** Plans the merchant can choose (active plans only). */
  plans: Omit<PlanDto, 'subscriberCount'>[];
  /** How to pay MysoftKH (bank account etc.), shown with open invoices. */
  paymentInstructions: string;
}
