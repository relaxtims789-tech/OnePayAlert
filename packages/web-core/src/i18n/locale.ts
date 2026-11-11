import type { Locale } from '@onepay/shared';

/** Plain module (no 'use client'): usable from server components too. */
export const LOCALE_COOKIE = 'op_locale';
export const LOCALE_LABELS: Record<Locale, string> = { km: 'ខ្មែរ', en: 'English', zh: '中文' };
export const LOCALE_TAGS: Record<Locale, string> = { km: 'km-KH', en: 'en-US', zh: 'zh-CN' };

export function isLocale(v: unknown): v is Locale {
  return v === 'km' || v === 'en' || v === 'zh';
}

export type Dictionary = Record<string, Record<string, string>>;

export type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Typed lookup with `{var}` interpolation and English fallback. */
export function createTranslate<M extends Dictionary>(dicts: Record<Locale, M>) {
  return function translate(locale: Locale, key: Paths<M>, vars?: Record<string, string | number>): string {
    const [ns, k] = (key as string).split('.') as [string, string];
    const raw = dicts[locale]?.[ns]?.[k] ?? dicts.en[ns]?.[k] ?? (key as string);
    return vars ? raw.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? `{${v}}`)) : raw;
  };
}
