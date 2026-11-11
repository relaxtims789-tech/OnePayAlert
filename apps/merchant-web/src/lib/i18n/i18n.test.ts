import { describe, expect, it } from 'vitest';
import { DICTIONARIES, translate } from './config';
import { en } from './en';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n dictionaries', () => {
  for (const [locale, dict] of Object.entries(DICTIONARIES)) {
    it(`${locale}: has every key, no blanks, same placeholders as English`, () => {
      for (const [ns, entries] of Object.entries(en)) {
        const target = (dict as Record<string, Record<string, string>>)[ns];
        expect(target, `${locale}.${ns}`).toBeDefined();
        for (const [key, source] of Object.entries(entries)) {
          const value = target![key];
          expect(value, `${locale}.${ns}.${key}`).toBeTypeOf('string');
          expect(value!.trim().length, `${locale}.${ns}.${key} is empty`).toBeGreaterThan(0);
          expect(placeholders(value!), `${locale}.${ns}.${key} placeholders`).toEqual(placeholders(source));
        }
        expect(Object.keys(target!).sort()).toEqual(Object.keys(entries).sort());
      }
    });
  }

  it('Khmer and Chinese are actually translated (not copies of English)', () => {
    const differs = (l: 'km' | 'zh') =>
      Object.entries(en).flatMap(([ns, e]) => Object.keys(e).map((k) => DICTIONARIES[l][ns as keyof typeof en][k as never] !== (e as Record<string, string>)[k]));
    const ratio = (l: 'km' | 'zh') => differs(l).filter(Boolean).length / differs(l).length;
    expect(ratio('km')).toBeGreaterThan(0.9);
    expect(ratio('zh')).toBeGreaterThan(0.9);
  });

  it('interpolates variables', () => {
    expect(translate('en', 'dashboard.greeting', { name: 'Dara' })).toBe('Hello, Dara');
    expect(translate('km', 'dashboard.greeting', { name: 'Dara' })).toBe('សួស្តី Dara');
    expect(translate('zh', 'common.pageSummary', { from: 1, to: 20, total: 45 })).toBe('第 1–20 条，共 45 条');
  });
});
