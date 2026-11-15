import { describe, expect, it } from 'vitest';
import { businessDate, dateTime, fullDate, money, shortDate, startOfBusinessDay } from './format';

describe('format', () => {
  it('uses Phnom Penh business days (UTC+7)', () => {
    // 2026-11-11 18:30 UTC = 2026-11-12 01:30 in Phnom Penh
    const now = new Date('2026-11-11T18:30:00Z');
    expect(startOfBusinessDay(0, now).toISOString()).toBe('2026-11-11T17:00:00.000Z');
    expect(startOfBusinessDay(6, now).toISOString()).toBe('2026-11-05T17:00:00.000Z');
    expect(businessDate(now)).toBe('2026-11-12');
  });

  it('formats Khmer dates without relying on browser locale data', () => {
    expect(dateTime('2026-11-11T07:12:00Z', 'km')).toBe('11 វិច្ឆិកា 14:12');
    expect(shortDate('2026-01-05', 'km')).toBe('5 មករា');
    expect(dateTime('2026-11-11T07:12:00Z', 'en')).toContain('14:12');
  });

  it('shows the year for far-off dates such as a token expiry', () => {
    const iso = '2026-12-31T17:00:00.000Z'; // 1 Jan 2027, 00:00 in Phnom Penh
    expect(fullDate(iso, 'en')).toBe('1 Jan 2027');
    expect(fullDate(iso, 'km')).toBe('1 មករា 2027');
    expect(fullDate(iso, 'zh')).toBe('2027年1月1日');
  });

  it('formats money from integer minor units', () => {
    expect(money(1250, 'USD', 'en')).toBe('$12.50');
    expect(money(4000000, 'KHR', 'en')).toContain('៛');
  });
});
