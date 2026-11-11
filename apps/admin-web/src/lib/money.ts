import { toMinorUnits, type Currency } from '@onepay/shared';

/** Converts a decimal price field (e.g. "29.00") to integer minor units; null when invalid. */
export function parsePrice(price: string, currency: Currency): number | null {
  try {
    const minor = toMinorUnits(price, currency);
    return minor >= 0n && minor <= 1_000_000_000n ? Number(minor) : null;
  } catch {
    return null;
  }
}
