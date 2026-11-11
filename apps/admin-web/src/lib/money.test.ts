import { describe, expect, it } from 'vitest';
import { parsePrice } from './money';

describe('parsePrice', () => {
  it('converts decimal prices to integer minor units without float errors', () => {
    expect(parsePrice('29.00', 'USD')).toBe(2900);
    expect(parsePrice('19.99', 'USD')).toBe(1999);
    expect(parsePrice('0.1', 'USD')).toBe(10);
    expect(parsePrice('40000', 'KHR')).toBe(4000000);
  });
  it('rejects malformed, negative, over-precise and absurd prices', () => {
    for (const bad of ['', 'abc', '-1', '1.234', '1e3', '99999999999']) expect(parsePrice(bad, 'USD')).toBeNull();
  });
});
