'use client';

import { MAX_REPORT_DAYS, Permission, type Currency, type ReportBreakdownRow, type ReportGranularity, type SalesReportDto } from '@onepay/shared';
import { Alert, Button, Card, CardHeader, EmptyState, ErrorState, Input, Segmented, Select, Skeleton, StatCard, Table, TableSkeleton, Td, Th } from '@onepay/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, FileDown, FileSpreadsheet, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/page-header';
import { api, download } from '@/lib/api';
import { businessDate, businessDayStart, money, shortDate } from '@/lib/format';
import { errorText, useCan, useErrorToast, useOutletOptions } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

type Preset = 'thisMonth' | 'lastMonth' | 'last30' | 'custom';
const DAY = 86_400_000;

/** Inclusive Phnom Penh calendar range for a preset. */
function presetRange(p: Exclude<Preset, 'custom'>, now = new Date()): { from: string; to: string } {
  const today = businessDate(now);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const ymd = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  if (p === 'thisMonth') return { from: ymd(y, m, 1), to: today };
  if (p === 'lastMonth') return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) };
  return { from: businessDate(new Date(businessDayStart(today).getTime() - 29 * DAY)), to: today };
}

export default function ReportsPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const toastError = useErrorToast();
  const allowed = can(Permission.REPORT_READ);

  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [custom, setCustom] = useState(() => presetRange('last30'));
  const [granularity, setGranularity] = useState<ReportGranularity>('day');
  const [outletId, setOutletId] = useState('');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [chartCurrency, setChartCurrency] = useState<Currency | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const range = preset === 'custom' ? custom : presetRange(preset);
  const fromDate = businessDayStart(range.from);
  const toDate = new Date(businessDayStart(range.to).getTime() + DAY);
  const rangeError =
    !range.from || !range.to || toDate <= fromDate
      ? t('reports.rangeInvalid')
      : toDate.getTime() - fromDate.getTime() > MAX_REPORT_DAYS * DAY
        ? t('reports.rangeTooLong')
        : null;

  const params = {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    granularity,
    outletId: outletId || undefined,
    includeSimulated: includeDemo,
  };
  const outlets = useOutletOptions(allowed && can(Permission.OUTLET_READ));
  const report = useQuery({
    queryKey: ['reports-sales', params],
    queryFn: () => api.get<SalesReportDto>('reports/sales', params),
    enabled: allowed && !rangeError,
    placeholderData: keepPreviousData,
  });

  const currencies = useMemo(() => {
    const seen = new Set<Currency>(report.data?.totals.map((x) => x.currency));
    const list = (['USD', 'KHR'] as Currency[]).filter((c) => seen.has(c));
    return list.length ? list : (['USD'] as Currency[]);
  }, [report.data]);
  const activeCurrency = chartCurrency && currencies.includes(chartCurrency) ? chartCurrency : currencies[0]!;
  const periodLabel = (p: string) =>
    granularity === 'month'
      ? new Intl.DateTimeFormat(locale === 'km' ? 'km-KH' : locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${p}T00:00:00Z`))
      : granularity === 'week'
        ? t('reports.weekOf', { date: shortDate(p, locale) })
        : shortDate(p, locale);
  const chartData = (report.data?.series ?? [])
    .filter((s) => s.currency === activeCurrency)
    .map((s) => ({ label: periodLabel(s.period), amount: s.successAmountMinor }));
  const hasData = (report.data?.totals ?? []).some((x) => x.successCount > 0);

  async function exportFile(kind: 'csv' | 'pdf') {
    setExporting(kind);
    try {
      if (kind === 'csv') {
        await download('reports/transactions.csv', { from: params.from, to: params.to, outletId: params.outletId, includeSimulated: includeDemo }, 'payments.csv');
      } else {
        await download('reports/sales.pdf', params, 'sales-report.pdf');
      }
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(null);
    }
  }

  if (!allowed) {
    return (
      <>
        <PageHeader title={t('reports.title')} />
        <Card>
          <EmptyState icon={<BarChart3 className="size-6" />} title={t('common.forbidden')} description={t('reports.noPermission')} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void exportFile('csv')}
              disabled={!!rangeError || exporting !== null}
              icon={<FileSpreadsheet className="size-4" />}
              data-testid="export-csv"
            >
              {exporting === 'csv' ? t('reports.exporting') : t('reports.exportCsv')}
            </Button>
            <Button onClick={() => void exportFile('pdf')} disabled={!!rangeError || exporting !== null} icon={<FileDown className="size-4" />} data-testid="export-pdf">
              {exporting === 'pdf' ? t('reports.exporting') : t('reports.exportPdf')}
            </Button>
          </>
        }
      />

      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <Segmented
            value={preset}
            onChange={setPreset}
            ariaLabel={t('common.date')}
            options={[
              { value: 'thisMonth', label: t('reports.thisMonth') },
              { value: 'lastMonth', label: t('reports.lastMonth') },
              { value: 'last30', label: t('reports.last30') },
              { value: 'custom', label: t('reports.custom') },
            ]}
          />
          {preset === 'custom' ? (
            <div className="flex flex-wrap gap-2">
              <label className="text-xs font-medium text-ink-2">
                {t('reports.from')}
                <Input type="date" className="mt-1" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} data-testid="report-from" />
              </label>
              <label className="text-xs font-medium text-ink-2">
                {t('reports.to')}
                <Input type="date" className="mt-1" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} data-testid="report-to" />
              </label>
            </div>
          ) : (
            <p className="text-sm text-ink-2 tabular-nums xl:pb-2">
              {shortDate(range.from, locale)} – {shortDate(range.to, locale)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
            <Segmented
              value={granularity}
              onChange={setGranularity}
              ariaLabel={t('reports.groupBy')}
              options={[
                { value: 'day', label: t('reports.day') },
                { value: 'week', label: t('reports.week') },
                { value: 'month', label: t('reports.month') },
              ]}
            />
            {outlets.data && outlets.data.length > 1 ? (
              <Select aria-label={t('common.outlet')} value={outletId} onChange={(e) => setOutletId(e.target.value)} className="w-auto">
                <option value="">{t('transactions.allOutlets')}</option>
                {outlets.data.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" className="size-4 accent-[#0759B8]" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
              {t('reports.includeDemo')}
            </label>
          </div>
        </div>
        {rangeError ? (
          <Alert tone="warning" className="mt-3">
            {rangeError}
          </Alert>
        ) : null}
      </Card>

      {report.isError ? (
        <Card>
          <ErrorState title={t('common.somethingWrong')} message={errorText(report.error, t)} onRetry={() => void report.refetch()} retryLabel={t('common.retry')} />
        </Card>
      ) : (
        <div className={report.isFetching && !report.isPending ? 'opacity-70 transition-opacity' : undefined}>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="report-totals">
            {(['USD', 'KHR'] as Currency[]).map((c) => {
              const x = report.data?.totals.find((v) => v.currency === c);
              return (
                <StatCard
                  key={c}
                  label={t('reports.received', { currency: c })}
                  value={money(x?.successAmountMinor ?? 0, c, locale)}
                  hint={`${t('reports.paymentsCount', { count: x?.successCount ?? 0 })} · ${t('reports.pendingFailed', { pending: x?.pendingCount ?? 0, failed: x?.failedCount ?? 0 })}`}
                  icon={<Wallet className="size-[18px]" />}
                  loading={report.isPending}
                />
              );
            })}
          </div>

          <Card className="mb-6">
            <CardHeader
              title={t('reports.overTime')}
              actions={
                currencies.length > 1 ? (
                  <Segmented value={activeCurrency} onChange={setChartCurrency} options={currencies.map((c) => ({ value: c, label: c }))} ariaLabel={t('common.currency')} />
                ) : null
              }
            />
            <div className="h-72 px-2 pt-4 pb-4 sm:px-4">
              {report.isPending ? (
                <Skeleton className="h-full w-full" />
              ) : !hasData ? (
                <EmptyState icon={<BarChart3 className="size-6" />} title={t('reports.empty')} description={t('reports.emptyHint')} className="h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#E3E8EF" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8794A7', fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} width={80} tick={{ fill: '#8794A7', fontSize: 12 }} tickFormatter={(v: number) => money(v, activeCurrency, locale)} />
                    <Tooltip
                      cursor={{ fill: '#EAF2FC' }}
                      formatter={(v) => [money(Number(v), activeCurrency, locale), t('common.amount')]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #E3E8EF' }}
                    />
                    <Bar dataKey="amount" fill="#0759B8" radius={[8, 8, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Breakdown title={t('reports.byOutlet')} first={t('common.outlet')} rows={report.data?.byOutlet} blank={t('reports.noOutlet')} loading={report.isPending} testId="by-outlet" />
            <Breakdown title={t('reports.byProvider')} first={t('transactions.provider')} rows={report.data?.byProvider} blank="—" loading={report.isPending} testId="by-provider" />
          </div>
        </div>
      )}
    </>
  );
}

function Breakdown({
  title,
  first,
  rows,
  blank,
  loading,
  testId,
}: {
  title: string;
  first: string;
  rows: ReportBreakdownRow[] | undefined;
  blank: string;
  loading: boolean;
  testId: string;
}) {
  const { t, locale } = useI18n();
  return (
    <Card>
      <CardHeader title={title} />
      <div className="mt-3">
        {loading ? (
          <TableSkeleton cols={3} rows={3} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState title={t('reports.empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{first}</Th>
                <Th className="text-right">{t('reports.payments')}</Th>
                <Th className="text-right">{t('common.amount')}</Th>
              </tr>
            </thead>
            <tbody data-testid={testId}>
              {rows.map((r) => (
                <tr key={`${r.key}-${r.currency}`}>
                  <Td className="font-medium text-ink">{r.label || blank}</Td>
                  <Td className="text-right tabular-nums text-ink-2">{r.successCount}</Td>
                  <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{money(r.successAmountMinor, r.currency, locale)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
