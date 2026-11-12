import { API_ERRORS, errorMessage, matchErrorMessage, type ApiErrorCode } from './errors';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
/** DUPLICATE's {field} is a database column name, so translations deliberately leave it out. */
const DROPS_PLACEHOLDERS: ApiErrorCode[] = ['DUPLICATE'];

describe('API error catalog', () => {
  it.each(Object.keys(API_ERRORS) as ApiErrorCode[])('%s keeps the same placeholders in km and zh', (code) => {
    const t = API_ERRORS[code];
    expect(t.km.trim()).not.toBe('');
    expect(t.zh.trim()).not.toBe('');
    if (DROPS_PLACEHOLDERS.includes(code)) return;
    expect(placeholders(t.km)).toEqual(placeholders(t.en));
    expect(placeholders(t.zh)).toEqual(placeholders(t.en));
  });

  it('recognises plain English messages already thrown by the API', () => {
    expect(matchErrorMessage('Invalid email or password')).toEqual({ code: 'INVALID_CREDENTIALS', params: {} });
    expect(matchErrorMessage('Something nobody catalogued')).toBeNull();
  });

  it('recognises templated messages and extracts their values', () => {
    expect(matchErrorMessage('Date range cannot exceed 366 days')).toEqual({
      code: 'DATE_RANGE_TOO_LONG',
      params: { days: '366' },
    });
  });

  it('fills placeholders in the requested language', () => {
    expect(errorMessage('PLAN_LIMIT_OUTLETS', 'zh', { plan: 'Starter', limit: 1 })).toBe(
      '您的 Starter 套餐最多可有 1 个启用门店。升级套餐即可添加更多。',
    );
    expect(errorMessage('DATE_RANGE_TOO_LONG', 'km', { days: 31 })).toContain('31');
  });
});
