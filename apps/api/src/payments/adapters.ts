import {
  AdapterKey,
  EVENT_TYPE_TO_STATUS,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_TOLERANCE_SECONDS,
  toMinorUnits,
  type Currency,
  type TransactionStatus,
} from '@onepay/shared';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Provider-independent shape every adapter normalises into. */
export interface NormalizedPaymentEvent {
  eventId: string;
  providerTxnId: string;
  status: TransactionStatus;
  amountMinor: bigint;
  currency: Currency;
  occurredAt: Date;
  payerName: string | null;
  payerAccountMasked: string | null;
  reference: string | null;
  description: string | null;
  outletCode: string | null;
}

export class InvalidPayloadError extends Error {}

/**
 * A provider integration. New banks/gateways are added by implementing this interface once
 * the institution grants API access; nothing else in the ingestion pipeline changes.
 */
export interface ProviderAdapter {
  key: string;
  /** Whether events may arrive on the public webhook endpoint. */
  acceptsPublicWebhooks: boolean;
  /** Demo-only adapters are refused when APP_ENV=production. */
  demoOnly: boolean;
  verifySignature(headers: Record<string, string | string[] | undefined>, rawBody: Buffer, secret: string): boolean;
  parse(payload: unknown): NormalizedPaymentEvent;
}

const text = (max: number) => z.string().trim().min(1).max(max);

const onePayV1Schema = z
  .object({
    eventId: text(128),
    type: z.enum(['payment.pending', 'payment.succeeded', 'payment.failed', 'payment.reversed']),
    transactionId: text(128),
    amount: z.string().regex(/^\d{1,13}(\.\d{1,6})?$/, 'amount must be a positive decimal string'),
    currency: z.enum(['USD', 'KHR']),
    occurredAt: z.string().datetime({ offset: true }),
    payer: z.object({ name: text(160).optional(), account: text(64).optional() }).strict().optional(),
    reference: text(160).optional(),
    description: text(500).optional(),
    outletCode: text(32).optional(),
  })
  .strict();

export function parseOnePayV1(payload: unknown): NormalizedPaymentEvent {
  const parsed = onePayV1Schema.safeParse(payload);
  if (!parsed.success) {
    throw new InvalidPayloadError(
      parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
    );
  }
  const p = parsed.data;
  let amountMinor: bigint;
  try {
    amountMinor = toMinorUnits(p.amount, p.currency);
  } catch (e) {
    throw new InvalidPayloadError((e as Error).message);
  }
  const occurredAt = new Date(p.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
    throw new InvalidPayloadError('occurredAt is in the future');
  }
  return {
    eventId: p.eventId,
    providerTxnId: p.transactionId,
    status: EVENT_TYPE_TO_STATUS[p.type],
    amountMinor,
    currency: p.currency,
    occurredAt,
    payerName: p.payer?.name ?? null,
    payerAccountMasked: p.payer?.account ? maskAccount(p.payer.account) : null,
    reference: p.reference ?? null,
    description: p.description ?? null,
    outletCode: p.outletCode?.toUpperCase() ?? null,
  };
}

export function signOnePayV1(secret: string, timestamp: number, rawBody: string | Buffer): string {
  const mac = createHmac('sha256', secret);
  mac.update(`${timestamp}.`);
  mac.update(rawBody);
  return `v1=${mac.digest('hex')}`;
}

function header(h: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = h[name];
  return Array.isArray(v) ? v[0] : v;
}

export function verifyOnePayV1(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const ts = Number(header(headers, WEBHOOK_TIMESTAMP_HEADER));
  const sig = header(headers, WEBHOOK_SIGNATURE_HEADER);
  if (!Number.isInteger(ts) || !sig) return false;
  if (Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signOnePayV1(secret, ts, rawBody));
  const given = Buffer.from(sig.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const ADAPTERS: Readonly<Record<string, ProviderAdapter>> = {
  [AdapterKey.ONEPAY_WEBHOOK_V1]: {
    key: AdapterKey.ONEPAY_WEBHOOK_V1,
    acceptsPublicWebhooks: true,
    demoOnly: false,
    verifySignature: verifyOnePayV1,
    parse: parseOnePayV1,
  },
  [AdapterKey.SIMULATOR]: {
    key: AdapterKey.SIMULATOR,
    acceptsPublicWebhooks: false,
    demoOnly: true,
    verifySignature: () => false,
    parse: parseOnePayV1,
  },
};

export function adapterFor(key: string | null | undefined): ProviderAdapter | null {
  return key ? (ADAPTERS[key] ?? null) : null;
}

/** Masks payer account numbers before a payload is persisted (inbox and transaction raw payload). */
export function sanitizeForStorage(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const p = payload as Record<string, unknown>;
  const payer = p.payer as Record<string, unknown> | undefined;
  if (payer && typeof payer === 'object' && typeof payer.account === 'string') {
    return { ...p, payer: { ...payer, account: maskAccount(payer.account) } };
  }
  return payload;
}

/** "001234567" -> "•••• 4567". Full account numbers are never stored. */
export function maskAccount(account: string): string {
  const digits = account.replace(/\s+/g, '');
  return digits.length <= 4 ? '••••' : `•••• ${digits.slice(-4)}`;
}

/** Secrets are bound to their connection id (AES-GCM AAD) so ciphertexts cannot be swapped between rows. */
export const webhookSecretAad = (connectionId: string) => `bank_connection:${connectionId}:webhook_secret`;
export const credentialsAad = (connectionId: string) => `bank_connection:${connectionId}:credentials`;

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}
