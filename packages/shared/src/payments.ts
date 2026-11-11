import type { TransactionStatus } from './enums';
import type { Currency } from './money';

export const AdapterKey = {
  /** One PayAlert standard signed webhook (partners, payment middleware, gateways). */
  ONEPAY_WEBHOOK_V1: 'ONEPAY_WEBHOOK_V1',
  /** Demo-only simulator. Rejected by the API when APP_ENV=production. */
  SIMULATOR: 'SIMULATOR',
} as const;
export type AdapterKey = (typeof AdapterKey)[keyof typeof AdapterKey];

export type BankConnectionStatus = 'PENDING' | 'ACTIVE' | 'ERROR' | 'DISCONNECTED';
export type ProviderType = 'BANK' | 'WALLET' | 'GATEWAY';
export type TransactionDirection = 'CREDIT' | 'DEBIT';

export interface PaymentProviderDto {
  id: string;
  code: string;
  name: string;
  type: ProviderType;
  logoUrl: string | null;
  /** False when no live integration exists yet for this provider. */
  integrationAvailable: boolean;
  isDemo: boolean;
}

export interface BankConnectionDto {
  id: string;
  companyId: string;
  outletId: string | null;
  provider: Pick<PaymentProviderDto, 'id' | 'code' | 'name' | 'type' | 'isDemo'>;
  displayName: string;
  accountName: string | null;
  accountNumberMasked: string | null;
  currency: Currency;
  status: BankConnectionStatus;
  /** Credentials are write-only: only whether they are set is ever returned. */
  hasCredentials: boolean;
  webhookUrl: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

/** Returned only once, on creation or secret rotation. */
export interface BankConnectionWithSecretDto extends BankConnectionDto {
  webhookSecret: string | null;
}

export interface TransactionDto {
  id: string;
  companyId: string;
  outletId: string | null;
  bankConnectionId: string;
  providerCode: string;
  providerTxnId: string;
  direction: TransactionDirection;
  status: TransactionStatus;
  /** Integer minor units (e.g. USD cents). */
  amountMinor: number;
  currency: Currency;
  payerName: string | null;
  payerAccountMasked: string | null;
  reference: string | null;
  description: string | null;
  isSimulated: boolean;
  occurredAt: string;
  receivedAt: string;
}

export interface CurrencySummary {
  currency: Currency;
  successCount: number;
  successAmountMinor: number;
  pendingCount: number;
  failedCount: number;
  reversedCount: number;
  reversedAmountMinor: number;
}

export interface DailyTotal {
  /** Calendar date in Asia/Phnom_Penh, YYYY-MM-DD. */
  date: string;
  currency: Currency;
  successCount: number;
  successAmountMinor: number;
}

export interface TransactionSummaryDto {
  from: string;
  to: string;
  byCurrency: CurrencySummary[];
  daily: DailyTotal[];
}

/** Server → client WebSocket events on the `/realtime` namespace. */
export const RealtimeEvent = {
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_UPDATED: 'transaction.updated',
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

// ───────────────── ONEPAY_WEBHOOK_V1 specification ─────────────────
//
// POST /api/v1/webhooks/{bankConnectionId}
// Headers:
//   Content-Type: application/json
//   X-OnePay-Timestamp: <unix seconds>
//   X-OnePay-Signature: v1=<hex HMAC-SHA256(webhookSecret, `${timestamp}.${rawBody}`)>
// Requests older or newer than 5 minutes are rejected (replay protection).

export const WEBHOOK_TIMESTAMP_HEADER = 'x-onepay-timestamp';
export const WEBHOOK_SIGNATURE_HEADER = 'x-onepay-signature';
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type OnePayWebhookEventType =
  | 'payment.pending'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.reversed';

export interface OnePayWebhookV1Payload {
  /** Unique per event; used for idempotency. */
  eventId: string;
  type: OnePayWebhookEventType;
  /** Provider's transaction id. Several events may refer to the same transaction. */
  transactionId: string;
  /** Decimal string, e.g. "12.50". Never a float. */
  amount: string;
  currency: Currency;
  /** ISO-8601 timestamp. */
  occurredAt: string;
  payer?: { name?: string; account?: string };
  reference?: string;
  description?: string;
  /** Optional outlet code to attribute the payment to a specific outlet. */
  outletCode?: string;
}

export const EVENT_TYPE_TO_STATUS: Readonly<Record<OnePayWebhookEventType, TransactionStatus>> = {
  'payment.pending': 'PENDING',
  'payment.succeeded': 'SUCCESS',
  'payment.failed': 'FAILED',
  'payment.reversed': 'REVERSED',
};

/** Allowed status transitions for an existing transaction. */
export const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<TransactionStatus, readonly TransactionStatus[]>> = {
  PENDING: ['SUCCESS', 'FAILED'],
  SUCCESS: ['REVERSED'],
  FAILED: [],
  REVERSED: [],
};
