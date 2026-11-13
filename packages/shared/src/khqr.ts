import type { Currency } from './money';

export type KhqrChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED' | 'REVIEW';

/** How long a customer has to pay a KHQR code. */
export const KHQR_CHARGE_TTL_SECONDS = 300;

/** Bakong account ids look like "name@bank" (Bakong limits them to 32 characters). */
export const BAKONG_ACCOUNT_PATTERN = /^[a-z0-9_.]{2,24}@[a-z0-9]{2,8}$/;

/** A KHQR payment request. */
export interface KhqrChargeDto {
  id: string;
  bankConnectionId: string;
  outletId: string | null;
  reference: string;
  amountMinor: number;
  currency: Currency;
  /** The KHQR payload to render as a QR code. */
  qr: string;
  md5: string;
  status: KhqrChargeStatus;
  merchantName: string;
  expiresAt: string;
  paidAt: string | null;
  payerAccount: string | null;
  /** Demo charge, paid with the simulated Bakong (never in production). */
  simulated: boolean;
  createdAt: string;
}

/** GET /khqr/accounts: Bakong accounts this member may collect into (no bank-connection permission needed). */
export interface KhqrAccountDto {
  /** The bank connection id, passed as bankConnectionId when creating a charge. */
  id: string;
  displayName: string;
  /** Bakong account id, e.g. "shop@aclb". */
  accountId: string;
  /** Name customers see in their bank app. */
  merchantName: string;
  currency: Currency;
  outletId: string | null;
}

/** Bakong connection health for MysoftKH (admin console, platform health). */
export interface KhqrHealthDto {
  mode: 'live' | 'simulated' | 'off';
  /** live only: error = token rejected or expired; warning = expiring soon or calls failing right now. */
  status: 'ok' | 'warning' | 'error' | 'simulated' | 'off';
  /** From the token itself when it is a JWT; null when unknown. */
  tokenExpiresAt: string | null;
  tokenDaysLeft: number | null;
  /** Bakong answered 401/403 to the latest call that failed, with no success since. */
  tokenRejected: boolean;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  /** KHQR codes waiting for payment right now, and the oldest one's creation time. */
  pendingCharges: number;
  oldestPendingAt: string | null;
}

/** GET /khqr/status: whether KHQR collection can confirm payments here. */
export interface KhqrStatusDto {
  /** live = Bakong Open API; simulated = demo/dev without a Bakong token; off = not available. */
  mode: 'live' | 'simulated' | 'off';
}
