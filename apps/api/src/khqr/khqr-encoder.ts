import type { Currency } from '@onepay/shared';
import { createHash } from 'node:crypto';

/**
 * KHQR (Cambodia's EMVCo merchant-presented QR) for an individual Bakong account, byte-for-byte
 * what NBC's official `bakong-khqr` SDK produces (checked in khqr-encoder.spec.ts). We do not use
 * the SDK at runtime because it ships an old axios with known advisories.
 *
 * Layout: 00 format · 01 static(11)/dynamic(12) · 29 account (00 Bakong id) · 52 MCC · 53 currency
 * · 54 amount · 58 KH · 59 name · 60 city · 62 additional data (01 bill, 02 mobile, 03 store,
 * 07 terminal) · 99 timestamps (00 created, 01 expires; dynamic only) · 63 CRC-16/CCITT-FALSE.
 */
export interface KhqrInput {
  bakongAccountId: string;
  merchantName: string;
  merchantCity?: string;
  currency: Currency;
  /** Integer minor units (USD cents; KHR uses exponent 2 internally, whole riel only). Omit for a static QR. */
  amountMinor?: number | bigint;
  billNumber?: string;
  mobileNumber?: string;
  storeLabel?: string;
  terminalLabel?: string;
  merchantCategoryCode?: string;
  /** Required for a dynamic QR (with amount). */
  createdAt?: Date;
  expiresAt?: Date;
}

export class KhqrInputError extends Error {}

const ISO_NUMERIC: Record<Currency, string> = { USD: '840', KHR: '116' };
const LIMITS = { account: 32, name: 25, city: 15, label: 25, amount: 13 } as const;
/** Printable ASCII only: EMV lengths are counted in characters, and Bakong apps expect Latin text. */
const ASCII = /^[\x20-\x7E]+$/;

const tlv = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

function checkText(label: string, value: string, max: number): string {
  if (!value || value.length > max || !ASCII.test(value)) {
    throw new KhqrInputError(`${label} must be 1-${max} printable Latin characters`);
  }
  return value;
}

/** Amount as the SDK writes it: KHR whole riel; USD "12" or "12.50". */
export function khqrAmount(amountMinor: number | bigint, currency: Currency): string {
  const minor = BigInt(amountMinor);
  if (minor <= 0n) throw new KhqrInputError('amount must be greater than zero');
  if (currency === 'KHR') {
    if (minor % 100n !== 0n) throw new KhqrInputError('KHR amounts must be whole riel');
    return (minor / 100n).toString();
  }
  const whole = minor / 100n;
  const cents = minor % 100n;
  return cents === 0n ? whole.toString() : `${whole}.${cents.toString().padStart(2, '0')}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over UTF-8, 4 upper-case hex digits. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function encodeKhqr(input: KhqrInput): { qr: string; md5: string } {
  const account = checkText('bakongAccountId', input.bakongAccountId, LIMITS.account);
  const name = checkText('merchantName', input.merchantName, LIMITS.name);
  const city = checkText('merchantCity', input.merchantCity ?? 'Phnom Penh', LIMITS.city);
  const dynamic = input.amountMinor !== undefined && BigInt(input.amountMinor) !== 0n;

  let out = tlv('00', '01') + tlv('01', dynamic ? '12' : '11');
  out += tlv('29', tlv('00', account));
  out += tlv('52', input.merchantCategoryCode ?? '5999');
  out += tlv('53', ISO_NUMERIC[input.currency]);
  if (dynamic) {
    const amount = khqrAmount(input.amountMinor as number | bigint, input.currency);
    if (amount.length > LIMITS.amount) throw new KhqrInputError('amount is too large');
    out += tlv('54', amount);
  }
  out += tlv('58', 'KH') + tlv('59', name) + tlv('60', city);

  let extra = '';
  if (input.billNumber) extra += tlv('01', checkText('billNumber', input.billNumber, LIMITS.label));
  if (input.mobileNumber) extra += tlv('02', checkText('mobileNumber', input.mobileNumber, LIMITS.label));
  if (input.storeLabel) extra += tlv('03', checkText('storeLabel', input.storeLabel, LIMITS.label));
  if (input.terminalLabel) extra += tlv('07', checkText('terminalLabel', input.terminalLabel, LIMITS.label));
  if (extra) out += tlv('62', extra);

  if (dynamic) {
    if (!input.createdAt || !input.expiresAt || input.expiresAt <= input.createdAt) {
      throw new KhqrInputError('a dynamic KHQR needs createdAt and a later expiresAt');
    }
    out += tlv('99', tlv('00', String(input.createdAt.getTime())) + tlv('01', String(input.expiresAt.getTime())));
  }

  out += '6304';
  const qr = out + crc16(out);
  return { qr, md5: createHash('md5').update(qr).digest('hex') };
}

/** Makes merchant/outlet names safe for KHQR: Latin letters, digits, spaces and basic punctuation. */
export function khqrSafeText(value: string, max: number): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
