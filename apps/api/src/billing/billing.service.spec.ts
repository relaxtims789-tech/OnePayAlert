import { pickLocale } from '../common/api-exception.filter';
import { csvCell, phnomPenhTime } from '../reports/reports.service';
import { addInterval } from './billing.service';

describe('addInterval', () => {
  const d = (iso: string) => new Date(iso);
  it('adds a calendar month, clamping to the last day of shorter months', () => {
    expect(addInterval(d('2026-01-31T05:00:00Z'), 'MONTH').toISOString()).toBe('2026-02-28T05:00:00.000Z');
    expect(addInterval(d('2028-01-31T05:00:00Z'), 'MONTH').toISOString()).toBe('2028-02-29T05:00:00.000Z');
    expect(addInterval(d('2026-03-15T00:00:00Z'), 'MONTH').toISOString()).toBe('2026-04-15T00:00:00.000Z');
    expect(addInterval(d('2026-12-10T00:00:00Z'), 'MONTH').toISOString()).toBe('2027-01-10T00:00:00.000Z');
  });
  it('adds a year (29 Feb → 28 Feb)', () => {
    expect(addInterval(d('2028-02-29T00:00:00Z'), 'YEAR').toISOString()).toBe('2029-02-28T00:00:00.000Z');
  });
});

describe('pickLocale', () => {
  it.each([
    [undefined, 'en'],
    ['km-KH,km;q=0.9,en;q=0.8', 'km'],
    ['zh-CN', 'zh'],
    ['fr-FR,de;q=0.9', 'en'],
    ['en;q=0.2, km;q=0.9', 'km'],
    ['fr, zh-TW;q=0.5', 'zh'],
  ])('%s → %s', (header, expected) => {
    expect(pickLocale(header)).toBe(expected);
  });
});

describe('CSV helpers', () => {
  it('quotes and neutralises spreadsheet formulas from untrusted text', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+855 12 345 678')).toBe("'+855 12 345 678");
    expect(csvCell('Lim, Dara')).toBe('"Lim, Dara"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('true');
  });
  it('prints Phnom Penh wall-clock time', () => {
    expect(phnomPenhTime(new Date('2026-03-01T17:00:00Z'))).toBe('2026-03-02 00:00:00');
  });
});
