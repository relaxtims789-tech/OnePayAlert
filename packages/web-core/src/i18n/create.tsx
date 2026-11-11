'use client';

import type { Locale } from '@onepay/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LOCALE_COOKIE, createTranslate, type Dictionary, type Paths } from './locale';

/** Builds a typed i18n provider/hook pair for one app's dictionaries. */
export function createI18n<M extends Dictionary>(dicts: Record<Locale, M>) {
  type Key = Paths<M>;
  type T = (key: Key, vars?: Record<string, string | number>) => string;
  interface Value {
    locale: Locale;
    t: T;
    setLocale: (l: Locale) => void;
  }
  const translate = createTranslate(dicts);
  const Ctx = createContext<Value | null>(null);

  function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(initialLocale);
    const setLocale = useCallback((l: Locale) => {
      setLocaleState(l);
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
    }, []);
    const t = useCallback<T>((key, vars) => translate(locale, key, vars), [locale]);
    const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useI18n(): Value {
    const v = useContext(Ctx);
    if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
    return v;
  }

  return { I18nProvider, useI18n, translate };
}
