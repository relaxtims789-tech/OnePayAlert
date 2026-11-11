'use client';

import { SUPPORTED_LOCALES, type BankConnectionStatus, type CompanyStatus, type Locale, type SubscriptionStatus } from '@onepay/shared';
import { Badge, cn, type Tone } from '@onepay/ui';
import { Languages } from 'lucide-react';
import type { ReactNode } from 'react';
import { LOCALE_LABELS, useI18n } from '@/lib/i18n';

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function LanguageSwitcher({ onChange, className, dark }: { onChange?: (l: Locale) => void; className?: string; dark?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">{t('common.language')}</span>
      <Languages className={cn('pointer-events-none absolute left-2.5 size-4', dark ? 'text-white/60' : 'text-ink-3')} aria-hidden />
      <select
        value={locale}
        data-testid="language-switcher"
        onChange={(e) => {
          const l = e.target.value as Locale;
          setLocale(l);
          onChange?.(l);
        }}
        className={cn(
          'h-9 appearance-none rounded-xl border pr-3 pl-8 text-sm focus:outline-none',
          dark ? 'border-white/15 bg-white/10 text-white' : 'border-line bg-white text-ink hover:bg-surface',
        )}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} className="text-ink">
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

const COMPANY_TONE: Record<CompanyStatus, Tone> = { ACTIVE: 'success', PENDING: 'pending', SUSPENDED: 'failed', CLOSED: 'neutral' };
const SUB_TONE: Record<SubscriptionStatus, Tone> = { ACTIVE: 'success', TRIALING: 'brand', PAST_DUE: 'pending', CANCELED: 'neutral', EXPIRED: 'failed' };
const CONN_TONE: Record<BankConnectionStatus, Tone> = { ACTIVE: 'success', PENDING: 'pending', ERROR: 'failed', DISCONNECTED: 'neutral' };

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const { t } = useI18n();
  return (
    <Badge tone={COMPANY_TONE[status]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(`companyStatus.${status}`)}
    </Badge>
  );
}

export function SubStatusBadge({ status }: { status: SubscriptionStatus }) {
  const { t } = useI18n();
  return <Badge tone={SUB_TONE[status]}>{t(`subStatus.${status}`)}</Badge>;
}

export function ConnStatusBadge({ status }: { status: BankConnectionStatus }) {
  const { t } = useI18n();
  return <Badge tone={CONN_TONE[status]}>{t(`connStatus.${status}`)}</Badge>;
}

export function KeyValue({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-2">{k}</dt>
      <dd className="text-right font-medium break-all text-ink">{v ?? '—'}</dd>
    </div>
  );
}
