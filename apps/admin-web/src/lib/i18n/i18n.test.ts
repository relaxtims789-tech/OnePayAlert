import { describe, expect, it } from 'vitest';
import { DICTIONARIES, translate } from './config';
import { en } from './en';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('admin i18n dictionaries', () => {
  for (const [locale, dict] of Object.entries(DICTIONARIES)) {
    it(`${locale}: every key present, non-empty, same placeholders as English`, () => {
      for (const [ns, entries] of Object.entries(en)) {
        const target = (dict as Record<string, Record<string, string>>)[ns]!;
        expect(Object.keys(target).sort()).toEqual(Object.keys(entries).sort());
        for (const [key, source] of Object.entries(entries)) {
          expect(target[key]!.trim().length, `${locale}.${ns}.${key}`).toBeGreaterThan(0);
          expect(placeholders(target[key]!), `${locale}.${ns}.${key}`).toEqual(placeholders(source));
        }
      }
    });
  }

  it('interpolates', () => {
    expect(translate('en', 'overview.pipelineIssues', { failed: 2, stuck: 1 })).toBe('2 failed (24h) · 1 stuck');
    expect(translate('km', 'merchants.confirmTitle', { action: 'ផ្អាក', name: 'Dara' })).toBe('ផ្អាក៖ Dara');
  });
});
