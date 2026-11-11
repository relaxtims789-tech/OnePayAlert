'use client';

import {
  Permission,
  type BankConnectionDto,
  type Paginated,
  type TransactionDto,
  type TransactionStatus,
} from '@onepay/shared';
import { Card, EmptyState, ErrorState, Input, Modal, Pagination, Segmented, Select, Table, TableSkeleton, Td, Th } from '@onepay/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Receipt, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { LiveIndicator } from '@/components/live-indicator';
import { PageHeader } from '@/components/page-header';
import { DemoBadge, TxnStatus } from '@/components/status';
import { api } from '@/lib/api';
import { dateTime, money, startOfBusinessDay } from '@/lib/format';
import { errorText, queryKeys, useCan, useOutletOptions } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

type Preset = 'today' | '7d' | '30d' | 'all';
const PAGE_SIZE = 20;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

export default function TransactionsPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const [preset, setPreset] = useState<Preset>('7d');
  const [status, setStatus] = useState<TransactionStatus | ''>('');
  const [currency, setCurrency] = useState<'' | 'USD' | 'KHR'>('');
  const [outletId, setOutletId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TransactionDto | null>(null);
  const q = useDebounced(search.trim());

  useEffect(() => setPage(1), [preset, status, currency, outletId, q]);

  const from =
    preset === 'today'
      ? startOfBusinessDay(0)
      : preset === '7d'
        ? startOfBusinessDay(6)
        : preset === '30d'
          ? startOfBusinessDay(29)
          : null;
  const params = {
    page,
    pageSize: PAGE_SIZE,
    from: from?.toISOString(),
    status: status || undefined,
    currency: currency || undefined,
    outletId: outletId || undefined,
    search: q || undefined,
  };
  const list = useQuery({
    queryKey: queryKeys.transactions(params),
    queryFn: () => api.get<Paginated<TransactionDto>>('transactions', params),
    placeholderData: keepPreviousData,
  });
  const outlets = useOutletOptions(can(Permission.OUTLET_READ));
  const connections = useQuery({
    queryKey: queryKeys.connections,
    queryFn: () => api.get<Paginated<BankConnectionDto>>('bank-connections', { pageSize: 100 }),
    enabled: can(Permission.BANK_CONNECTION_READ),
  });
  const outletName = (id: string | null) => (id ? (outlets.data?.find((o) => o.id === id)?.name ?? '—') : t('transactions.noOutlet'));
  const connectionName = (id: string) => connections.data?.items.find((c) => c.id === id)?.displayName;

  const total = list.data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader title={t('transactions.title')} subtitle={t('transactions.subtitle')} actions={<LiveIndicator />} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <Segmented
            value={preset}
            onChange={setPreset}
            ariaLabel={t('common.date')}
            options={[
              { value: 'today', label: t('transactions.today') },
              { value: '7d', label: t('transactions.last7') },
              { value: '30d', label: t('transactions.last30') },
              { value: 'all', label: t('transactions.allTime') },
            ]}
          />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              type="search"
              placeholder={t('transactions.searchPlaceholder')}
              aria-label={t('common.search')}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
            <Select aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value as TransactionStatus | '')}>
              <option value="">{t('transactions.allStatuses')}</option>
              {(['SUCCESS', 'PENDING', 'FAILED', 'REVERSED'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t('common.currency')} value={currency} onChange={(e) => setCurrency(e.target.value as '' | 'USD' | 'KHR')}>
              <option value="">{t('transactions.allCurrencies')}</option>
              <option value="USD">USD</option>
              <option value="KHR">KHR</option>
            </Select>
            {outlets.data && outlets.data.length > 1 ? (
              <Select aria-label={t('common.outlet')} value={outletId} onChange={(e) => setOutletId(e.target.value)} className="col-span-2 sm:col-span-1">
                <option value="">{t('transactions.allOutlets')}</option>
                {outlets.data.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        </div>

        {list.isPending ? (
          <TableSkeleton cols={6} />
        ) : list.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(list.error, t)} onRetry={() => void list.refetch()} retryLabel={t('common.retry')} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<Receipt className="size-6" />} title={t('transactions.empty')} description={t('transactions.emptyHint')} />
        ) : (
          <>
            <Table className={list.isFetching ? 'opacity-70 transition-opacity' : undefined}>
              <thead>
                <tr>
                  <Th>{t('transactions.time')}</Th>
                  <Th>{t('transactions.payer')}</Th>
                  <Th>{t('transactions.provider')}</Th>
                  <Th>{t('common.outlet')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th className="text-right">{t('common.amount')}</Th>
                </tr>
              </thead>
              <tbody data-testid="transactions-table">
                {list.data.items.map((txn) => (
                  <tr key={txn.id} className="cursor-pointer hover:bg-surface/70" onClick={() => setSelected(txn)}>
                    <Td className="whitespace-nowrap text-ink-2">{dateTime(txn.occurredAt, locale)}</Td>
                    <Td>
                      <button type="button" className="text-left font-medium text-ink hover:text-brand" onClick={() => setSelected(txn)}>
                        {txn.payerName ?? '—'}
                      </button>
                      <p className="text-xs text-ink-3">{txn.reference ?? txn.providerTxnId}</p>
                    </Td>
                    <Td className="text-ink-2">
                      {connectionName(txn.bankConnectionId) ?? txn.providerCode} {txn.isSimulated ? <DemoBadge /> : null}
                    </Td>
                    <Td className="text-ink-2">{outletName(txn.outletId)}</Td>
                    <Td>
                      <TxnStatus status={txn.status} />
                    </Td>
                    <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{money(txn.amountMinor, txn.currency, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={setPage}
              labels={{ previous: t('common.previous'), next: t('common.next'), summary: t('common.pageSummary', { from: first, to: last, total }) }}
            />
          </>
        )}
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={t('transactions.details')} closeLabel={t('common.close')}>
        {selected ? (
          <div>
            <div className="mb-5 rounded-2xl bg-surface p-5 text-center">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(selected.amountMinor, selected.currency, locale)}</p>
              <div className="mt-2 flex justify-center gap-2">
                <TxnStatus status={selected.status} />
                {selected.isSimulated ? <DemoBadge /> : null}
              </div>
            </div>
            <dl className="divide-y divide-line text-sm">
              <Row k={t('transactions.payer')} v={selected.payerName} />
              <Row k={t('transactions.payerAccount')} v={selected.payerAccountMasked} />
              <Row k={t('transactions.reference')} v={selected.reference} />
              <Row k={t('transactions.description')} v={selected.description} />
              <Row k={t('transactions.provider')} v={connectionName(selected.bankConnectionId) ?? selected.providerCode} />
              <Row k={t('common.outlet')} v={outletName(selected.outletId)} />
              <Row k={t('transactions.providerTxnId')} v={<code className="text-xs break-all">{selected.providerTxnId}</code>} />
              <Row k={t('transactions.occurredAt')} v={dateTime(selected.occurredAt, locale)} />
              <Row k={t('transactions.receivedAt')} v={dateTime(selected.receivedAt, locale)} />
              {selected.isSimulated ? <Row k={t('common.demo')} v={t('transactions.simulated')} /> : null}
            </dl>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-ink-2">{k}</dt>
      <dd className="text-right font-medium text-ink">{v ?? '—'}</dd>
    </div>
  );
}
