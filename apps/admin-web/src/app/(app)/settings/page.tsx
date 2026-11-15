'use client';

import {
  PLATFORM_SETTING_MAX_LENGTH,
  type PlatformSettingDto,
  type PlatformSettingKey,
  type PlatformSettingsDto,
  type SettingTestResultDto,
} from '@onepay/shared';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Input, Skeleton, cn, useToast } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { dateTime, fullDate } from '@onepay/web-core/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { PageHeader } from '@/components/common';
import { errorText, keys, useErrorToast } from '@/lib/hooks';
import { useI18n, type MessageKey } from '@/lib/i18n';

const DAY_MS = 86_400_000;

export default function SettingsPage() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: keys.settings, queryFn: () => api.get<PlatformSettingsDto>('platform/settings') });

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      {q.isPending ? (
        <div className="grid gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState title={t('common.somethingWrong')} message={errorText(q.error, t)} onRetry={() => void q.refetch()} retryLabel={t('common.retry')} />
        </Card>
      ) : (
        <div className="grid gap-6" data-testid="system-settings">
          <BakongCard data={q.data} />
          <MailCard data={q.data} />
          <Card>
            <CardHeader title={t('settings.invoiceTitle')} subtitle={t('settings.invoiceSubtitle')} />
            <div className="p-5">
              <SettingEditor setting={pick(q.data, 'BILLING_PAYMENT_INSTRUCTIONS')} label={t('settings.instructions')} multiline />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function pick(data: PlatformSettingsDto, key: PlatformSettingKey): PlatformSettingDto {
  return data.settings.find((s) => s.key === key)!;
}

function BakongCard({ data }: { data: PlatformSettingsDto }) {
  const { t, locale } = useI18n();
  const expires = data.bakongTokenExpiresAt;
  const daysLeft = expires ? Math.floor((new Date(expires).getTime() - Date.now()) / DAY_MS) : null;
  const mode = data.bakongMode;
  return (
    <Card data-testid="settings-bakong">
      <CardHeader
        title={t('settings.bakongTitle')}
        subtitle={t('settings.bakongSubtitle')}
        actions={
          <Badge tone={mode === 'live' ? 'success' : mode === 'simulated' ? 'pending' : 'failed'}>
            <span data-testid="bakong-mode">{t(`settings.mode_${mode}` as MessageKey)}</span>
          </Badge>
        }
      />
      <div className="grid gap-4 p-5">
        {mode === 'off' ? <Alert tone="warning">{t('settings.bakongOff')}</Alert> : null}
        {expires && daysLeft !== null ? (
          <Alert tone={daysLeft < 0 ? 'error' : daysLeft <= 14 ? 'warning' : 'info'}>
            <span data-testid="bakong-expiry">
              {daysLeft < 0
                ? t('settings.tokenExpired', { date: fullDate(expires, locale) })
                : t('settings.tokenExpires', { date: fullDate(expires, locale), days: daysLeft })}
            </span>
          </Alert>
        ) : null}
        <SettingEditor setting={pick(data, 'BAKONG_API_TOKEN')} label={t('settings.token')} hint={t('settings.tokenHint')} testLabel={t('settings.testBakong')} />
      </div>
    </Card>
  );
}

function MailCard({ data }: { data: PlatformSettingsDto }) {
  const { t } = useI18n();
  return (
    <Card data-testid="settings-mail">
      <CardHeader title={t('settings.mailTitle')} subtitle={t('settings.mailSubtitle')} />
      <div className="grid gap-6 p-5">
        {data.mailDriver === 'log' ? <Alert tone="info">{t('settings.mailLogDriver')}</Alert> : null}
        <SettingEditor setting={pick(data, 'SMTP_URL')} label={t('settings.smtpUrl')} hint={t('settings.smtpHint')} testLabel={t('settings.sendTest')} />
        <SettingEditor setting={pick(data, 'MAIL_FROM')} label={t('settings.mailFrom')} hint={t('settings.mailFromHint')} />
      </div>
    </Card>
  );
}

const SOURCE_TONE = { console: 'brand', environment: 'neutral', default: 'neutral', unset: 'failed' } as const;

/** One setting: what is in use and where it comes from, a form to change it, and (optionally) a test. */
function SettingEditor({
  setting,
  label,
  hint,
  multiline = false,
  testLabel,
}: {
  setting: PlatformSettingDto;
  label: string;
  hint?: ReactNode;
  multiline?: boolean;
  testLabel?: string;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const [value, setValue] = useState(setting.secret ? '' : (setting.value ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SettingTestResultDto | null>(null);
  const id = setting.key.toLowerCase();

  const onSaved = (data: PlatformSettingsDto) => {
    qc.setQueryData(keys.settings, data);
    const fresh = data.settings.find((s) => s.key === setting.key);
    setValue(setting.secret ? '' : (fresh?.value ?? ''));
    setError(null);
    setResult(null);
  };
  const save = useMutation({
    mutationFn: () => api.put<PlatformSettingsDto>(`platform/settings/${setting.key}`, { value }),
    onSuccess: (data) => {
      onSaved(data);
      show({ tone: 'success', title: t('settings.saved') });
    },
    onError: (e) => setError(errorText(e, t)),
  });
  const clear = useMutation({
    mutationFn: () => api.del<PlatformSettingsDto>(`platform/settings/${setting.key}`),
    onSuccess: (data) => {
      onSaved(data);
      show({ tone: 'success', title: t('settings.cleared') });
    },
    onError: toastError,
  });
  const test = useMutation({
    mutationFn: () => api.post<SettingTestResultDto>(`platform/settings/${setting.key}/test`),
    onSuccess: setResult,
    onError: toastError,
  });

  const current = setting.secret ? (setting.hint ?? t('settings.notSet')) : setting.value || t('settings.notSet');
  const unchanged = !setting.secret && value.trim() === (setting.value ?? '').trim();

  return (
    <div className="grid gap-3" data-testid={`setting-${id}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">{t('settings.inUse')}</span>
        {setting.secret || !multiline ? (
          <code className="max-w-full truncate rounded-md bg-surface px-2 py-0.5 text-xs text-ink" data-testid={`setting-${id}-current`}>
            {current}
          </code>
        ) : null}
        <Badge tone={SOURCE_TONE[setting.source]}>
          <span data-testid={`setting-${id}-source`}>{t(`settings.source_${setting.source}` as MessageKey)}</span>
        </Badge>
        {setting.updatedAt ? (
          <span className="text-xs text-ink-3">
            {t('settings.savedBy', { date: dateTime(setting.updatedAt, locale), who: setting.updatedBy ?? '—' })}
          </span>
        ) : null}
      </div>
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <Field label={label} hint={hint} error={error}>
          {(p) =>
            multiline ? (
              <textarea
                {...p}
                rows={4}
                maxLength={PLATFORM_SETTING_MAX_LENGTH[setting.key]}
                className={cn(
                  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-brand-2 focus:ring-3 focus:ring-brand-100 focus:outline-none',
                )}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                data-testid={`setting-${id}-input`}
              />
            ) : (
              <Input
                {...p}
                type={setting.secret ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                placeholder={setting.secret ? t('settings.pasteNew') : undefined}
                maxLength={PLATFORM_SETTING_MAX_LENGTH[setting.key]}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                data-testid={`setting-${id}-input`}
              />
            )
          }
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={save.isPending} disabled={!value.trim() || unchanged} data-testid={`setting-${id}-save`}>
            {t('common.save')}
          </Button>
          {testLabel ? (
            <Button type="button" variant="secondary" loading={test.isPending} onClick={() => test.mutate()} data-testid={`setting-${id}-test`}>
              {testLabel}
            </Button>
          ) : null}
          {setting.source === 'console' ? (
            <Button type="button" variant="ghost" loading={clear.isPending} onClick={() => clear.mutate()} data-testid={`setting-${id}-clear`}>
              {t('settings.useServerValue')}
            </Button>
          ) : null}
        </div>
      </form>
      {result ? (
        <Alert tone={result.ok ? 'success' : 'error'}>
          <span data-testid={`setting-${id}-result`}>
            {t(`settings.test_${setting.key === 'SMTP_URL' ? 'mail' : 'bakong'}_${result.reason}` as MessageKey, { email: result.detail ?? '' })}
          </span>
          {!result.ok && result.detail ? <span className="mt-1 block text-xs opacity-80">{result.detail}</span> : null}
        </Alert>
      ) : null}
    </div>
  );
}
