import type { Locale } from '@onepay/shared';
import { createTranslate, type Paths } from '@onepay/web-core/locale';
import { en, type Messages } from './en';
import { km } from './km';
import { zh } from './zh';

export { LOCALE_COOKIE, LOCALE_LABELS, LOCALE_TAGS, isLocale } from '@onepay/web-core/locale';

/** Usable from both server and client components. */
export const DICTIONARIES: Record<Locale, Messages> = { en, km, zh };
export type MessageKey = Paths<Messages>;
export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;
export const translate = createTranslate(DICTIONARIES);
