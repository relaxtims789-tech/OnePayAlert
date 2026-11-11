import type { Locale } from '@onepay/shared';
import { createTranslate, type Paths } from '@onepay/web-core/locale';
import { en, type Messages } from './en';
import { km } from './km';
import { zh } from './zh';

export { LOCALE_COOKIE, LOCALE_LABELS, isLocale } from '@onepay/web-core/locale';

export const DICTIONARIES: Record<Locale, Messages> = { en, km, zh };
export type MessageKey = Paths<Messages>;
export const translate = createTranslate(DICTIONARIES);
