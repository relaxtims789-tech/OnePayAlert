'use client';

import { createI18n } from '@onepay/web-core/i18n';
import { DICTIONARIES } from './config';

export { LOCALE_LABELS, translate, type MessageKey } from './config';

export const { I18nProvider, useI18n } = createI18n(DICTIONARIES);
