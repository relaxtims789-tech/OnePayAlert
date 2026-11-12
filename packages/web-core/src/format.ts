import { formatMoney, type Currency, type Locale } from '@onepay/shared';

export const BUSINESS_TZ = 'Asia/Phnom_Penh';
const TAGS: Record<Exclude<Locale, 'km'>, string> = { en: 'en-GB', zh: 'zh-CN' };

/**
 * Khmer month names. Many browsers/devices ship without Khmer date data and silently fall
 * back to English, so Khmer dates are formatted explicitly.
 */
export const KHMER_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];

export const money = (amountMinor: number, currency: Currency, locale: Locale) => formatMoney(amountMinor, currency, locale);

/** Wall-clock parts in Phnom Penh (UTC+7, no DST). */
function ppParts(d: Date) {
  const local = new Date(d.getTime() + 7 * 3600_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    hh: String(local.getUTCHours()).padStart(2, '0'),
    mm: String(local.getUTCMinutes()).padStart(2, '0'),
    ss: String(local.getUTCSeconds()).padStart(2, '0'),
  };
}

export function dateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (locale === 'km') {
    const p = ppParts(d);
    return `${p.day} ${KHMER_MONTHS[p.month]} ${p.hh}:${p.mm}`;
  }
  return new Intl.DateTimeFormat(TAGS[locale], {
    timeZone: BUSINESS_TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function timeOnly(iso: string, locale: Locale): string {
  const p = ppParts(new Date(iso));
  return locale === 'km' ? `${p.hh}:${p.mm}:${p.ss}` : new Intl.DateTimeFormat(TAGS[locale], { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso));
}

/** "2026-11-11" → "11 Nov" / "11 វិច្ឆិកា" / "11月11日". */
export function shortDate(ymd: string, locale: Locale): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  if (locale === 'km') return `${d} ${KHMER_MONTHS[m - 1]}`;
  return new Intl.DateTimeFormat(TAGS[locale], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

/** Start of a business day in Phnom Penh, `daysAgo` days back. */
export function startOfBusinessDay(daysAgo = 0, now = new Date()): Date {
  const offsetMs = 7 * 3600_000;
  const local = new Date(now.getTime() + offsetMs);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysAgo);
  return new Date(startLocal - offsetMs);
}

/** YYYY-MM-DD in Phnom Penh. */
export function businessDate(d: Date): string {
  const p = ppParts(d);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Start of a Phnom Penh calendar day ("2026-03-01" → 2026-02-28T17:00:00.000Z). */
export function businessDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - 7 * 3600_000);
}
