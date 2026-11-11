'use client';

import {
  Permission,
  type BankConnectionDto,
  type CompanyDto,
  type Currency,
  type Paginated,
  type TransactionDto,
  type TransactionSummaryDto,
} from '@onepay/shared';
import { Button, Card, CardHeader, EmptyState, ErrorState, Segmented, Skeleton, StatCard, useToast } from '@onepay/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BellOff, BellRing, CheckCircle2, Clock, Landmark, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LiveIndicator } from '@/components/live-indicator';
import { PageHeader } from '@/components/page-header';
import { TransactionRow } from '@/components/transaction-row';
import { api } from '@/lib/api';
import { businessDate, money, shortDate, startOfBusinessDay } from '@/lib/format';
import { errorText, queryKeys, useCan, useMe, useOutletOptions } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const me = useMe();
  const canTxn = can(Permission.TRANSACTION_READ);
  const { soundEnabled, setSoundEnabled, subscribe } = useRealtime();
  const { show } = useToast();
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Recomputed per render so "today" rolls over at Phnom Penh midnight.
  const todayFrom = startOfBusinessDay(0).toISOString();
  const weekFrom = startOfBusinessDay(6).toISOString();

  const company = useQuery({ queryKey: queryKeys.company, queryFn: () => api.get<CompanyDto>('companies/current') });
  const today = useQuery({
    queryKey: queryKeys.summary({ from: todayFrom }),
    queryFn: () => api.get<TransactionSummaryDto>('transactions/summary', { from: todayFrom }),
    enabled: canTxn,
    refetchInterval: 60_000,
  });
  const week = useQuery({
    queryKey: queryKeys.summary({ from: weekFrom }),
    queryFn: () => api.get<TransactionSummaryDto>('transactions/summary', { from: weekFrom }),
    enabled: canTxn,
  });
  const recent = useQuery({
    queryKey: queryKeys.transactions({ recent: true }),
    queryFn: () => api.get<Paginated<TransactionDto>>('transactions', { pageSize: 8 }),
    enabled: canTxn,
  });
  const connections = useQuery({
    queryKey: queryKeys.connections,
    queryFn: () => api.get<Paginated<BankConnectionDto>>('bank-connections', { pageSize: 100 }),
    enabled: can(Permission.BANK_CONNECTION_READ),
  });
  const outlets = useOutletOptions(can(Permission.OUTLET_READ));
  const outletName = (id: string | null) => (id ? outlets.data?.find((o) => o.id === id)?.name : undefined);

  useEffect(
    () =>
      subscribe((txn, kind) => {
        if (kind !== 'created') return;
        setFresh((s) => new Set(s).add(txn.id));
        if (txn.status === 'SUCCESS') {
          show({ tone: 'success', title: t('dashboard.newPayment', { amount: money(txn.amountMinor, txn.currency, locale) }), description: txn.payerName ?? undefined });
        }
      }),
    [subscribe, show, t, locale],
  );

  const currencies: Currency[] = useMemo(() => {
    const def = company.data?.defaultCurrency ?? 'USD';
    return def === 'USD' ? ['USD', 'KHR'] : ['KHR', 'USD'];
  }, [company.data?.defaultCurrency]);
  const [chartCurrency, setChartCurrency] = useState<Currency | null>(null);
  const activeChartCurrency = chartCurrency ?? currencies[0]!;

  const byCur = (c: Currency) => today.data?.byCurrency.find((x) => x.currency === c);
  const totals = today.data?.byCurrency ?? [];
  const sum = (k: 'successCount' | 'pendingCount' | 'failedCount') => totals.reduce((a, x) => a + x[k], 0);

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => businessDate(startOfBusinessDay(6 - i)));
    return days.map((d) => {
      const row = week.data?.daily.find((x) => x.date === d && x.currency === activeChartCurrency);
      return { date: d, label: shortDate(d, locale), amount: row?.successAmountMinor ?? 0, count: row?.successCount ?? 0 };
    });
  }, [week.data, activeChartCurrency, locale]);
  const hasChartData = chartData.some((d) => d.amount > 0);
  const noConnections = connections.isSuccess && connections.data.items.filter((c) => c.status !== 'DISCONNECTED').length === 0;

  return (
    <>
      <PageHeader
        title={t('dashboard.greeting', { name: me.data?.fullName.split(' ')[0] ?? '' })}
        subtitle={t('dashboard.subtitle')}
        actions={
          <Button
            variant={soundEnabled ? 'primary' : 'secondary'}
            onClick={() => setSoundEnabled(!soundEnabled)}
            icon={soundEnabled ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? t('dashboard.soundOn') : t('dashboard.soundOff')}
          </Button>
        }
      />

      {noConnections ? (
        <Card className="mb-6 flex flex-col items-start gap-4 bg-gradient-to-r from-brand to-brand-2 p-6 text-white sm:flex-row sm:items-center">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
            <Landmark className="size-6" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold">{t('dashboard.connectTitle')}</p>
            <p className="text-sm text-white/85">{t('dashboard.connectText')}</p>
          </div>
          <Link href="/bank-connections?connect=1">
            <Button variant="secondary">{t('dashboard.connectCta')}</Button>
          </Link>
        </Card>
      ) : null}

      {canTxn ? (
        <>
          {today.isError ? (
            <Card className="mb-6">
              <ErrorState title={t('common.somethingWrong')} message={errorText(today.error, t)} onRetry={() => void today.refetch()} retryLabel={t('common.retry')} />
            </Card>
          ) : (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {currencies.map((c) => (
                <StatCard
                  key={c}
                  label={t('dashboard.receivedToday', { currency: c })}
                  value={money(byCur(c)?.successAmountMinor ?? 0, c, locale)}
                  icon={<Wallet className="size-[18px]" />}
                  tone="brand"
                  loading={today.isPending}
                />
              ))}
              <StatCard label={t('dashboard.transactionsToday')} value={sum('successCount')} icon={<CheckCircle2 className="size-[18px]" />} tone="success" loading={today.isPending} />
              <StatCard
                label={`${t('dashboard.pendingToday')} / ${t('dashboard.failedToday')}`}
                value={
                  <span>
                    <span className="text-pending">{sum('pendingCount')}</span>
                    <span className="mx-1.5 text-ink-3">/</span>
                    <span className="text-failed">{sum('failedCount')}</span>
                  </span>
                }
                icon={sum('failedCount') > 0 ? <AlertCircle className="size-[18px]" /> : <Clock className="size-[18px]" />}
                tone={sum('failedCount') > 0 ? 'failed' : 'pending'}
                loading={today.isPending}
              />
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title={t('dashboard.last7Days')}
                subtitle={t('dashboard.last7DaysHint')}
                actions={
                  <Segmented
                    value={activeChartCurrency}
                    onChange={setChartCurrency}
                    options={currencies.map((c) => ({ value: c, label: c }))}
                    ariaLabel={t('common.currency')}
                  />
                }
              />
              <div className="h-72 px-2 pt-4 pb-4 sm:px-4">
                {week.isPending ? (
                  <Skeleton className="h-full w-full" />
                ) : week.isError ? (
                  <ErrorState title={t('common.somethingWrong')} onRetry={() => void week.refetch()} retryLabel={t('common.retry')} />
                ) : !hasChartData ? (
                  <EmptyState title={t('dashboard.noChartData')} className="h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#E3E8EF" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8794A7', fontSize: 12 }} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={72}
                        tick={{ fill: '#8794A7', fontSize: 12 }}
                        tickFormatter={(v: number) => money(v, activeChartCurrency, locale)}
                      />
                      <Tooltip
                        cursor={{ fill: '#EAF2FC' }}
                        formatter={(v) => [money(Number(v), activeChartCurrency, locale), t('common.amount')]}
                        contentStyle={{ borderRadius: 12, border: '1px solid #E3E8EF' }}
                      />
                      <Bar dataKey="amount" fill="#0759B8" radius={[8, 8, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="flex flex-col">
              <CardHeader
                title={t('dashboard.liveFeed')}
                actions={
                  <>
                    <LiveIndicator />
                    <Link href="/transactions" className="text-sm font-medium text-brand hover:underline">
                      {t('dashboard.viewAll')}
                    </Link>
                  </>
                }
              />
              <div className="mt-2 flex-1">
                {recent.isPending ? (
                  <div className="space-y-3 p-5">
                    {Array.from({ length: 4 }, (_, i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  </div>
                ) : recent.isError ? (
                  <ErrorState title={t('common.somethingWrong')} message={errorText(recent.error, t)} onRetry={() => void recent.refetch()} retryLabel={t('common.retry')} />
                ) : recent.data.items.length === 0 ? (
                  <EmptyState icon={<BellRing className="size-6" />} title={t('dashboard.noPayments')} description={t('dashboard.noPaymentsHint')} />
                ) : (
                  <ul className="divide-y divide-line/70" data-testid="live-feed">
                    {recent.data.items.map((txn) => (
                      <TransactionRow key={txn.id} txn={txn} fresh={fresh.has(txn.id)} outletName={outletName(txn.outletId)} />
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
