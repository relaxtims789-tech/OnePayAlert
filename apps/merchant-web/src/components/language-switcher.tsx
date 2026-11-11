'use client';

import { SUPPORTED_LOCALES, type Locale } from '@onepay/shared';
import { cn } from '@onepay/ui';
import { Languages } from 'lucide-react';
import { LOCALE_LABELS, useI18n } from '@/lib/i18n';

export function LanguageSwitcher({ onChange, className }: { onChange?: (l: Locale) => void; className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">{t('common.language')}</span>
      <Languages className="pointer-events-none absolute left-2.5 size-4 text-ink-3" aria-hidden />
      <select
        value={locale}
        data-testid="language-switcher"
        onChange={(e) => {
          const l = e.target.value as Locale;
          setLocale(l);
          onChange?.(l);
        }}
        className="h-9 appearance-none rounded-xl border border-line bg-white pr-3 pl-8 text-sm text-ink hover:bg-surface focus:outline-none"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
