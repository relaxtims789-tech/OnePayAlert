'use client';

import type { KhqrHealthDto, PlatformHealthDto } from '@onepay/shared';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, StatCard, Table, Td, Th, cn, useToast } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { dateTime } from '@onepay/web-core/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Database, HardDrive, Inbox, QrCode, RefreshCw, Rows3 } from 'lucide-react';
import { PageHeader } from '@/components/common';
import { errorText, keys, useCanManage, useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

export default function HealthPage() {
  const { t, locale } = useI18n();
  const canManage = useCanManage();
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const q = useQuery({ queryKey: keys.health, queryFn: () => api.get<PlatformHealthDto>('platform/health'), refetchInterval: 15_000 });

  const retry = useMutation({
    mutationFn: (id: string) => api.post(`platform/webhook-events/${id}/retry`),
    onSuccess: () => {
      show({ tone: 'success', title: t('health.requeued') });
      setTimeout(() => void qc.invalidateQueries({ queryKey: keys.health }), 1500);
    },
    onError: toastError,
  });

  if (q.isError) {
    return <ErrorState title={t('common.somethingWrong')} message={errorText(q.error, t)} onRetry={() => void q.refetch()} retryLabel={t('common.retry')} />;
  }
  const h = q.data;
  const banner = h ? { ok: 'bg-success-50 text-green-800', degraded: 'bg-pending-50 text-orange-800', error: 'bg-failed-50 text-failed' }[h.status] : '';
  const svc = (label: string, up: boolean | undefined, icon: React.ReactNode) => (
    <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
      <span className="flex items-center gap-2.5 text-sm font-medium">
        {icon}
        {label}
      </span>
      {up === undefined ? <Skeleton className="h-5 w-12" /> : <Badge tone={up ? 'success' : 'failed'}>{up ? t('health.up') : t('health.down')}</Badge>}
    </div>
  );

  return (
    <>
      <PageHeader
        title={t('health.title')}
        subtitle={t('health.subtitle')}
        actions={
          <Button variant="secondary" icon={<RefreshCw className={cn('size-4', q.isFetching && 'animate-spin')} />} onClick={() => void q.refetch()}>
            {t('common.refresh')}
          </Button>
        }
      />
      {h ? (
        <div className={cn('mb-6 flex items-center gap-2.5 rounded-2xl px-5 py-4 font-medium', banner)} data-testid="health-status" data-status={h.status}>
          <CheckCircle2 className="size-5" aria-hidden />
          {t(`health.${h.status}`)} · {t('health.environment')}: {h.environment}
        </div>
      ) : (
        <Skeleton className="mb-6 h-14 rounded-2xl" />
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {svc(t('health.database'), h ? h.database === 'up' : undefined, <Database className="size-4 text-ink-3" />)}
        {svc(t('health.redis'), h ? h.redis === 'up' : undefined, <HardDrive className="size-4 text-ink-3" />)}
        {svc(`${t('health.queue')}${h ? ` (${h.queueDriver})` : ''}`, h ? h.queue === 'up' : undefined, <Rows3 className="size-4 text-ink-3" />)}
      </div>
      {h ? <KhqrCard k={h.khqr} /> : <Skeleton className="mb-6 h-40 rounded-2xl" />}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('health.queued')} value={h?.webhookEvents.received ?? 0} loading={!h} icon={<Inbox className="size-[18px]" />} />
        <StatCard label={t('health.stuck')} value={h?.webhookEvents.stuck ?? 0} loading={!h} tone={h && h.webhookEvents.stuck > 0 ? 'pending' : 'success'} />
        <StatCard label={t('health.failed')} value={h?.webhookEvents.failedLast24h ?? 0} loading={!h} tone={h && h.webhookEvents.failedLast24h > 0 ? 'failed' : 'success'} />
        <StatCard label={t('health.processed')} value={h?.webhookEvents.processedLast24h ?? 0} loading={!h} tone="success" />
      </div>
      <Card>
        <CardHeader title={t('health.failures')} />
        <div className="mt-3">
          {!h ? (
            <Skeleton className="m-5 h-24" />
          ) : h.recentFailures.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="size-6" />} title={t('health.noFailures')} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t('health.received')}</Th>
                  <Th>{t('audit.company')}</Th>
                  <Th>{t('health.errorColumn')}</Th>
                  <Th className="text-right">{t('health.attempts')}</Th>
                  {canManage ? <Th className="text-right">{t('common.actions')}</Th> : null}
                </tr>
              </thead>
              <tbody data-testid="failures-table">
                {h.recentFailures.map((f) => (
                  <tr key={f.id}>
                    <Td className="whitespace-nowrap text-ink-2">{dateTime(f.receivedAt, locale)}</Td>
                    <Td>
                      <p className="font-medium">{f.companyName}</p>
                      <p className="text-xs text-ink-3">
                        {f.connectionName} · {f.providerCode} · <code>{f.providerEventId}</code>
                      </p>
                    </Td>
                    <Td className="max-w-sm text-sm text-failed">{f.lastError ?? '—'}</Td>
                    <Td className="text-right tabular-nums">{f.attempts}</Td>
                    {canManage ? (
                      <Td className="text-right">
                        <Button size="sm" variant="secondary" loading={retry.isPending && retry.variables === f.id} onClick={() => retry.mutate(f.id)}>
                          {t('health.requeue')}
                        </Button>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </>
  );
}

/** Bakong KHQR: whether payments can be confirmed, and when the token needs renewing. */
function KhqrCard({ k }: { k: KhqrHealthDto }) {
  const { t, locale } = useI18n();
  const badge =
    k.mode !== 'live'
      ? null
      : ({ ok: ['success', t('health.khqrOk')], warning: ['pending', t('health.khqrWarning')], error: ['failed', t('health.khqrError')] } as const)[
          k.status as 'ok' | 'warning' | 'error'
        ];
  const fact = (label: string, value: React.ReactNode, testId?: string) => (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-0.5 text-sm font-medium" data-testid={testId}>
        {value}
      </p>
    </div>
  );
  const expiry =
    k.tokenExpiresAt === null
      ? t('health.tokenUnknown')
      : k.tokenDaysLeft !== null && k.tokenDaysLeft < 0
        ? t('health.tokenExpired')
        : `${dateTime(k.tokenExpiresAt, locale)} · ${t('health.tokenDaysLeft', { days: k.tokenDaysLeft ?? 0 })}`;
  const expiringSoon = k.tokenDaysLeft !== null && k.tokenDaysLeft >= 0 && k.status === 'warning' && !k.tokenRejected && k.tokenDaysLeft <= 14;

  return (
    <Card className="mb-6" data-testid="khqr-health" data-status={k.status}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <QrCode className="size-4 text-ink-3" aria-hidden />
            {t('health.khqrTitle')}
          </span>
        }
        subtitle={k.mode === 'live' ? t('health.khqrLive') : undefined}
        actions={badge ? <Badge tone={badge[0]}>{badge[1]}</Badge> : null}
      />
      <div className="space-y-3 p-5 pt-3">
        {k.mode === 'live' && (k.tokenRejected || (k.tokenDaysLeft !== null && k.tokenDaysLeft < 0)) ? (
          <Alert tone="error">{t('health.tokenRejected')}</Alert>
        ) : expiringSoon ? (
          <Alert tone="warning">{t('health.tokenExpiring', { days: k.tokenDaysLeft ?? 0 })}</Alert>
        ) : k.status === 'warning' ? (
          <Alert tone="warning">{t('health.bakongFailing')}</Alert>
        ) : null}
        {k.mode === 'live' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {fact(t('health.tokenExpires'), expiry, 'khqr-token')}
            {fact(t('health.lastOk'), k.lastOkAt ? dateTime(k.lastOkAt, locale) : t('health.never'))}
            {fact(
              t('health.lastError'),
              k.lastErrorAt ? (
                <>
                  {dateTime(k.lastErrorAt, locale)}
                  <span className="block text-xs font-normal text-failed">{k.lastError}</span>
                </>
              ) : (
                t('health.never')
              ),
            )}
            {fact(
              t('health.pendingCodes'),
              <>
                {k.pendingCharges}
                {k.oldestPendingAt ? <span className="block text-xs font-normal text-ink-3">{t('health.oldestPending', { time: dateTime(k.oldestPendingAt, locale) })}</span> : null}
              </>,
              'khqr-pending',
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-2">{k.mode === 'simulated' ? t('health.khqrSimulated') : t('health.khqrOff')}</p>
        )}
      </div>
    </Card>
  );
}

