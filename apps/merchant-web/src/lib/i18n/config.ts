import type { Locale } from '@onepay/shared';
import { en, type Messages } from './en';
import { km } from './km';
import { zh } from './zh';

/** Usable from both server and client components. */
export const DICTIONARIES: Record<Locale, Messages> = { en, km, zh };
export const LOCALE_COOKIE = 'op_locale';
export const LOCALE_LABELS: Record<Locale, string> = { km: 'ខ្មែរ', en: 'English', zh: '中文' };
/** BCP-47 tags for Intl formatting. */
export const LOCALE_TAGS: Record<Locale, string> = { km: 'km-KH', en: 'en-US', zh: 'zh-CN' };

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;
export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const [ns, k] = key.split('.') as [keyof Messages, string];
  const dict = DICTIONARIES[locale] ?? en;
  const raw = (dict[ns] as Record<string, string>)[k] ?? (en[ns] as Record<string, string>)[k] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? `{${v}}`)) : raw;
}

export function isLocale(v: unknown): v is Locale {
  return v === 'km' || v === 'en' || v === 'zh';
}
