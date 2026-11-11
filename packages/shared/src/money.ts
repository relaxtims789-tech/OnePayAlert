/**
 * Money is always represented as an integer count of minor units (e.g. USD cents).
 * Never use floating point for stored or transferred amounts.
 */

export const Currency = {
  USD: 'USD',
  KHR: 'KHR',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];
export const SUPPORTED_CURRENCIES: readonly Currency[] = [Currency.USD, Currency.KHR];

/** ISO 4217 minor-unit exponents. KHR is 2 per ISO 4217, kept for bank/API interoperability. */
export const CURRENCY_EXPONENT: Readonly<Record<Currency, number>> = {
  USD: 2,
  KHR: 2,
};

/** Digits shown to end users. Riel has no sub-unit in circulation, so it is displayed whole. */
export const CURRENCY_DISPLAY_DECIMALS: Readonly<Record<Currency, number>> = {
  USD: 2,
  KHR: 0,
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Parse a decimal string (as sent by banks, e.g. "12.50") into integer minor units
 * without floating point arithmetic. Throws on malformed input or excess precision.
 */
export function toMinorUnits(decimal: string, currency: Currency): bigint {
  const exp = CURRENCY_EXPONENT[currency];
  const trimmed = decimal.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) throw new Error(`Invalid amount: "${decimal}"`);
  const [, sign, whole, fraction = ''] = match;
  const significant = fraction.replace(/0+$/, '');
  if (significant.length > exp) {
    throw new Error(`Amount "${decimal}" has more than ${exp} decimal places for ${currency}`);
  }
  const minor = BigInt(whole + fraction.padEnd(exp, '0').slice(0, exp));
  return sign ? -minor : minor;
}

/** Convert integer minor units to a plain decimal string (no grouping), e.g. 1250n -> "12.50". */
export function fromMinorUnits(minor: bigint | number, currency: Currency): string {
  const exp = CURRENCY_EXPONENT[currency];
  const value = typeof minor === 'bigint' ? minor : BigInt(assertSafeInteger(minor));
  const negative = value < 0n;
  const abs = (negative ? -value : value).toString().padStart(exp + 1, '0');
  const whole = exp === 0 ? abs : abs.slice(0, -exp);
  const fraction = exp === 0 ? '' : `.${abs.slice(-exp)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

const LOCALE_TAGS: Record<string, string> = { km: 'km-KH', en: 'en-US', zh: 'zh-CN' };

/** Human readable amount for UI, e.g. "$12.50" or "៛40,000". */
export function formatMoney(minor: bigint | number, currency: Currency, locale = 'en'): string {
  const decimals = CURRENCY_DISPLAY_DECIMALS[currency];
  const asNumber = Number(fromMinorUnits(minor, currency));
  return new Intl.NumberFormat(LOCALE_TAGS[locale] ?? 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(asNumber);
}

export function assertSafeInteger(n: number): number {
  if (!Number.isSafeInteger(n)) throw new Error(`Amount ${n} is not a safe integer of minor units`);
  return n;
}
