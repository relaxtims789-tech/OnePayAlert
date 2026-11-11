import { formatMoney, fromMinorUnits, toMinorUnits } from './money';

describe('money', () => {
  it('parses decimal strings into minor units without float errors', () => {
    expect(toMinorUnits('12.50', 'USD')).toBe(1250n);
    expect(toMinorUnits('0.1', 'USD')).toBe(10n);
    expect(toMinorUnits('19.99', 'USD')).toBe(1999n);
    expect(toMinorUnits('40000', 'KHR')).toBe(4000000n);
    expect(toMinorUnits('-3.05', 'USD')).toBe(-305n);
    expect(toMinorUnits('1.500', 'USD')).toBe(150n);
  });

  it('rejects malformed or over-precise amounts', () => {
    expect(() => toMinorUnits('abc', 'USD')).toThrow();
    expect(() => toMinorUnits('1.234', 'USD')).toThrow();
    expect(() => toMinorUnits('1e5', 'USD')).toThrow();
    expect(() => toMinorUnits('', 'USD')).toThrow();
  });

  it('round-trips minor units to decimal strings', () => {
    expect(fromMinorUnits(1250n, 'USD')).toBe('12.50');
    expect(fromMinorUnits(5, 'USD')).toBe('0.05');
    expect(fromMinorUnits(-305n, 'USD')).toBe('-3.05');
    expect(fromMinorUnits(0, 'KHR')).toBe('0.00');
    expect(() => fromMinorUnits(1.5, 'USD')).toThrow();
  });

  it('formats for display', () => {
    expect(formatMoney(1250, 'USD')).toBe('$12.50');
    expect(formatMoney(4000000, 'KHR', 'en')).toContain('40,000');
    expect(formatMoney(4000000, 'KHR', 'en')).toContain('៛');
    expect(formatMoney(4000000, 'KHR', 'en')).not.toContain('KHR');
  });
});
