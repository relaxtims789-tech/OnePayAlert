import { describe, expect, it } from 'vitest';
import { businessDate, dateTime, money, shortDate, startOfBusinessDay } from './format';

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

  it('formats money from integer minor units', () => {
    expect(money(1250, 'USD', 'en')).toBe('$12.50');
    expect(money(4000000, 'KHR', 'en')).toContain('៛');
  });
});
