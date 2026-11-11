'use client';

import type { PlatformOverviewDto } from '@onepay/shared';
import { Card, CardHeader, EmptyState, ErrorState, Skeleton, StatCard, Table, Td, Th } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { businessDate, dateTime, money, shortDate, startOfBusinessDay } from '@onepay/web-core/format';
import { useQuery } from '@tanstack/react-query';
import { Activity, Building2, Landmark, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CompanyStatusBadge, PageHeader, SubStatusBadge } from '@/components/common';
import { errorText, keys } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

export default function OverviewPage() {
  const { t, locale } = useI18n();
  const q = useQuery({
    queryKey: keys.overview,
    queryFn: () => api.get<PlatformOverviewDto>('platform/overview'),
    refetchInterval: 60_000,
  });

  const signups = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => businessDate(startOfBusinessDay(29 - i)));
    return days.map((d) => ({ date: d, label: shortDate(d, locale), count: q.data?.signupsDaily.find((s) => s.date === d)?.count ?? 0 }));
  }, [q.data, locale]);

  if (q.isError) {
    return <ErrorState title={t('common.somethingWrong')} message={errorText(q.error, t)} onRetry={() => void q.refetch()} retryLabel={t('common.retry')} />;
  }
  const d = q.data;
  const loading = q.isPending;
  const pipelineBad = !!d && (d.webhookEvents.failedLast24h > 0 || d.webhookEvents.stuck > 0);
  const amount = (c: 'USD' | 'KHR') => d?.paymentsToday.find((p) => p.currency === c);

  return (
    <>
      <PageHeader title={t('overview.title')} subtitle={t('overview.subtitle')} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="overview-kpis">
        <StatCard
          label={t('overview.merchants')}
          value={d?.merchants.total ?? 0}
          hint={d ? `${t('overview.newMerchants', { count: d.merchants.newLast30Days })} · ${t('overview.pending')}: ${d.merchants.byStatus.PENDING} · ${t('overview.suspended')}: ${d.merchants.byStatus.SUSPENDED}` : undefined}
          icon={<Building2 className="size-[18px]" />}
          loading={loading}
        />
        {(['USD', 'KHR'] as const).map((c) => (
          <StatCard
            key={c}
            label={t('overview.paymentsToday', { currency: c })}
            value={money(amount(c)?.amountMinor ?? 0, c, locale)}
            hint={t('overview.paymentsCount', { count: amount(c)?.count ?? 0 })}
            icon={<Wallet className="size-[18px]" />}
            tone="success"
            loading={loading}
          />
        ))}
        <StatCard
          label={t('overview.pipeline')}
          value={d ? (pipelineBad ? `${d.webhookEvents.failedLast24h + d.webhookEvents.stuck}` : '✓') : ''}
          hint={d ? (pipelineBad ? t('overview.pipelineIssues', { failed: d.webhookEvents.failedLast24h, stuck: d.webhookEvents.stuck }) : t('overview.pipelineOk')) : undefined}
          icon={<Activity className="size-[18px]" />}
          tone={pipelineBad ? 'failed' : 'success'}
          loading={loading}
        />
      </div>
      {d && d.simulatedPaymentsToday > 0 ? (
        <p className="-mt-3 mb-6 text-xs text-ink-3">{t('overview.simulatedExcluded', { count: d.simulatedPaymentsToday })}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title={t('overview.signups')} />
          <div className="h-64 px-2 py-4 sm:px-4">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : signups.every((s) => s.count === 0) ? (
              <EmptyState title={t('overview.noSignups')} className="h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signups} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#E3E8EF" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} tick={{ fill: '#8794A7', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8794A7', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#EAF2FC' }} contentStyle={{ borderRadius: 12, border: '1px solid #E3E8EF' }} />
                  <Bar dataKey="count" name={t('overview.merchants')} fill="#0759B8" radius={[6, 6, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-ink-2">{t('overview.connections')}</p>
              <div className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand">
                <Landmark className="size-[18px]" />
              </div>
            </div>
            {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-2xl font-semibold">{d!.connections.active}</p>}
            {d ? <p className="mt-1 text-xs text-ink-3">{t('overview.connectionsPending', { count: d.connections.pending })}</p> : null}
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-sm font-medium text-ink-2">{t('overview.subscriptions')}</p>
            {loading ? (
              <Skeleton className="h-16" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {(Object.entries(d!.subscriptions) as [keyof PlatformOverviewDto['subscriptions'], number][]).map(([s, n]) => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-sm">
                    <SubStatusBadge status={s} /> <span className="font-semibold tabular-nums">{n}</span>
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title={t('overview.recent')}
          actions={
            <Link href="/merchants" className="text-sm font-medium text-brand hover:underline">
              {t('overview.viewAll')}
            </Link>
          }
        />
        <div className="mt-3">
          {loading ? (
            <Skeleton className="m-5 h-40" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t('common.name')}</Th>
                  <Th>{t('merchants.owner')}</Th>
                  <Th>{t('merchants.plan')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th>{t('merchants.joined')}</Th>
                </tr>
              </thead>
              <tbody>
                {d!.recentMerchants.map((c) => (
                  <tr key={c.id} className="hover:bg-surface/70">
                    <Td>
                      <Link href={`/merchants/${c.id}`} className="font-medium text-ink hover:text-brand">
                        {c.name}
                      </Link>
                    </Td>
                    <Td className="text-ink-2">{c.ownerEmail ?? '—'}</Td>
                    <Td>{c.planCode ? <span className="text-ink-2">{c.planCode}</span> : '—'}</Td>
                    <Td>
                      <CompanyStatusBadge status={c.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{dateTime(c.createdAt, locale)}</Td>
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
