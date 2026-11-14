import type { Currency } from './money';

/**
 * Phone bank alerts: a merchant's Android phone forwards notifications from the bank apps they
 * choose (ABA, ACLEDA, Wing…), and the API decides here whether one says money came in.
 *
 * Parsing lives on the server, not in the app, so a bank changing its wording is fixed with a
 * server release. The rules are deliberately conservative: anything that is not clearly an
 * incoming payment with one amount and one currency is ignored rather than guessed.
 */

export type BankNotificationIgnoreReason = 'not_incoming' | 'outgoing' | 'security_code' | 'no_amount' | 'several_amounts';

export type ParsedBankNotification =
  | { kind: 'payment'; amount: string; currency: Currency; payerName: string | null }
  | { kind: 'ignored'; reason: BankNotificationIgnoreReason };

/** Most text we look at; bank notifications are short, anything longer is cut. */
const MAX_TEXT = 600;

const KHMER_DIGITS = /[០-៩]/g;
const toAsciiDigits = (s: string) => s.replace(KHMER_DIGITS, (d) => String(d.charCodeAt(0) - 0x17e0));

const SECURITY_CODE = /\b(otp|one[- ]time|verification code|passcode|security code|pin code)\b|លេខកូដ(សម្ងាត់|ផ្ទៀងផ្ទាត់)|验证码/i;

// "paid by NAME" is money in (merchant side); "paid to", "you paid" are money out.
const INCOMING =
  /\b(received|receive|credited|credit(ed)? to your|deposit(ed)?|incoming|paid by|transfer(red)? from|payment from|money in|you got)\b|បានទទួល|ទទួលបាន|ប្រាក់ចូល|收到|入账|已到账/i;
const OUTGOING =
  /\b(sent to|paid to|you paid|you sent|transfer(red)? to|debited|withdrawal|withdrawn|purchase|payment to|spent)\b|បានផ្ទេរទៅ|អ្នកបានបង់|ដកប្រាក់|转出|支出/i;

const CUR = String.raw`(USD|KHR|US\$|\$|៛|riels?|រៀល|ដុល្លារ)`;
const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const CUR_FIRST = new RegExp(`${CUR}\\s?${NUM}(?![\\d.])`, 'gi');
const NUM_FIRST = new RegExp(`(?<![\\d.,])${NUM}\\s?${CUR}`, 'gi');

const PAYER_EN = /\b(?:from|by)\s+([A-Za-z][A-Za-z .'-]{1,58}?[A-Za-z.])(?=\s*(?:\(|,|;|\.(?:\s|$)|\bon\b|\bat\b|\bvia\b|\bwith\b|\bto\b|\bref|\d|$))/;
const PAYER_KM = /ពី\s+([^\s,.()0-9][^,.()0-9]{0,40}?)(?=\s*(?:\(|,|\.|\s(?:តាម|នៅ|ថ្ងៃ)|\d|$))/;

function currencyOf(token: string): Currency {
  return /KHR|៛|riel|រៀល/i.test(token) ? 'KHR' : 'USD';
}

/** Decides whether a bank app notification reports money received, and how much. */
export function parseBankNotification(input: { title?: string | null; text: string }): ParsedBankNotification {
  const text = toAsciiDigits(`${input.title ?? ''} ${input.text}`.replace(/\s+/g, ' ').trim()).slice(0, MAX_TEXT);

  if (SECURITY_CODE.test(text)) return { kind: 'ignored', reason: 'security_code' };
  const incoming = INCOMING.test(text);
  if (!incoming) return { kind: 'ignored', reason: OUTGOING.test(text) ? 'outgoing' : 'not_incoming' };
  // Both directions in one message (e.g. "you paid … and received cashback") are not a clean payment.
  if (OUTGOING.test(text) && !/\bpaid by\b/i.test(text)) return { kind: 'ignored', reason: 'outgoing' };

  const found = new Map<string, { at: number; amount: string; currency: Currency }>();
  for (const m of text.matchAll(CUR_FIRST)) found.set(`${m.index}`, { at: m.index!, currency: currencyOf(m[1]!), amount: m[2]! });
  for (const m of text.matchAll(NUM_FIRST)) found.set(`${m.index}`, { at: m.index!, currency: currencyOf(m[2]!), amount: m[1]! });
  const amounts = [...found.values()]
    .map((a) => ({ ...a, amount: a.amount.replace(/,/g, '') }))
    .filter((a) => Number(a.amount) > 0)
    .sort((a, b) => a.at - b.at);
  // The same figure written twice ("USD 5.00 ($5.00)") counts once; different figures are ambiguous
  // (a balance or a fee next to the payment), so nothing is guessed.
  const distinct = new Map(amounts.map((a) => [`${a.currency}:${Number(a.amount)}`, a]));
  if (distinct.size === 0) return { kind: 'ignored', reason: 'no_amount' };
  if (distinct.size > 1) {
    const balance = /\b(balance|bal\.?|avail(able)?)\b|សមតុល្យ|余额/i;
    // Common layout: "Received $5.00 … Balance: $120.00" — keep the first amount when the others follow a balance label.
    const first = amounts[0]!;
    const rest = amounts.filter((a) => `${a.currency}:${Number(a.amount)}` !== `${first.currency}:${Number(first.amount)}`);
    const allBalances = rest.every((a) => balance.test(text.slice(Math.max(0, a.at - 24), a.at)));
    if (!allBalances) return { kind: 'ignored', reason: 'several_amounts' };
    distinct.clear();
    distinct.set('first', first);
  }
  const pick = [...distinct.values()][0]!;
  let amount = pick.amount;
  if (pick.currency === 'KHR') {
    if (/\.\d*[1-9]/.test(amount)) return { kind: 'ignored', reason: 'no_amount' };
    amount = amount.replace(/\.\d*$/, '');
  } else if (!amount.includes('.')) {
    amount = `${amount}.00`;
  } else if (/\.\d$/.test(amount)) {
    amount = `${amount}0`;
  }
  if (amount.replace('.', '').length > 12) return { kind: 'ignored', reason: 'no_amount' };

  const payer = PAYER_EN.exec(text)?.[1] ?? PAYER_KM.exec(text)?.[1] ?? null;
  return { kind: 'payment', amount, currency: pick.currency, payerName: payer ? payer.trim().slice(0, 80) : null };
}

/** Headers a relay phone signs its requests with (same HMAC scheme as the signed webhook). */
export const RELAY_ID_HEADER = 'x-onepay-relay-id';

/** A phone forwarding bank alerts, as the dashboard and app show it. */
export interface RelayPhoneDto {
  id: string;
  bankConnectionId: string;
  name: string;
  lastSeenAt: string | null;
  lastPaymentAt: string | null;
  createdAt: string;
}

/** Returned once when a phone is set up: the phone keeps the secret, the API only an encrypted copy. */
export interface RelayPhoneEnrollment {
  phone: RelayPhoneDto;
  relayId: string;
  secret: string;
}

/** POST /relay/notifications body, sent by the phone for each notification of a chosen bank app. */
export interface RelayNotificationInput {
  /** Stable per notification on the phone (package + post time + text hash). */
  key: string;
  /** Android package of the bank app, e.g. "com.paygo24.ibank". */
  app: string;
  title?: string | null;
  text: string;
  postedAt: string;
}

export type RelayNotificationResult =
  | { status: 'accepted' }
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: BankNotificationIgnoreReason | 'other_currency' | 'too_old' };
