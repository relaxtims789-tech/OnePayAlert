'use client';

import type { Locale } from '@onepay/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LOCALE_COOKIE, translate, type TFunction } from './config';

export { LOCALE_LABELS, LOCALE_TAGS, isLocale, translate, type MessageKey, type TFunction } from './config';

interface I18nValue {
  locale: Locale;
  t: TFunction;
  setLocale: (l: Locale) => void;
}
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);
  const t = useCallback<TFunction>((key, vars) => translate(locale, key, vars), [locale]);
  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
