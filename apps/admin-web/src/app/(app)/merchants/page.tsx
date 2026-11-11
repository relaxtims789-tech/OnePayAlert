'use client';

import type { CompanyStatus, Paginated, PlatformCompanyDto } from '@onepay/shared';
import { Card, EmptyState, ErrorState, Input, Pagination, Select, Table, TableSkeleton, Td, Th } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { dateTime } from '@onepay/web-core/format';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CompanyStatusBadge, PageHeader, SubStatusBadge } from '@/components/common';
import { errorText, keys } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

const PAGE = 20;

export default function MerchantsPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<CompanyStatus | ''>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);
  useEffect(() => setPage(1), [q, status]);

  const params = { page, pageSize: PAGE, search: q || undefined, status: status || undefined };
  const list = useQuery({
    queryKey: keys.merchants(params),
    queryFn: () => api.get<Paginated<PlatformCompanyDto>>('platform/companies', params),
    placeholderData: keepPreviousData,
  });
  const total = list.data?.total ?? 0;

  return (
    <>
      <PageHeader title={t('merchants.title')} subtitle={t('merchants.subtitle')} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              type="search"
              aria-label={t('common.search')}
              placeholder={t('merchants.searchPlaceholder')}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select aria-label={t('common.status')} className="sm:w-56" value={status} onChange={(e) => setStatus(e.target.value as CompanyStatus | '')}>
            <option value="">{t('merchants.allStatuses')}</option>
            {(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`companyStatus.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        {list.isPending ? (
          <TableSkeleton cols={6} />
        ) : list.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(list.error, t)} onRetry={() => void list.refetch()} retryLabel={t('common.retry')} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<Building2 className="size-6" />} title={t('merchants.empty')} />
        ) : (
          <>
            <Table className={list.isFetching ? 'opacity-70' : undefined}>
              <thead>
                <tr>
                  <Th>{t('common.name')}</Th>
                  <Th>{t('merchants.owner')}</Th>
                  <Th>{t('merchants.plan')}</Th>
                  <Th className="text-right">{t('merchants.outlets')}</Th>
                  <Th className="text-right">{t('merchants.employees')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th>{t('merchants.joined')}</Th>
                </tr>
              </thead>
              <tbody data-testid="merchants-table">
                {list.data.items.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-surface/70" onClick={() => router.push(`/merchants/${c.id}`)}>
                    <Td>
                      <Link href={`/merchants/${c.id}`} className="font-medium text-ink hover:text-brand" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      <p className="text-xs text-ink-3">{c.phone ?? c.email ?? ''}</p>
                    </Td>
                    <Td className="text-ink-2">{c.ownerEmail ?? '—'}</Td>
                    <Td>
                      {c.planCode ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-ink-2">{c.planCode}</span>
                          {c.subscriptionStatus ? <SubStatusBadge status={c.subscriptionStatus} /> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{c.outletCount}</Td>
                    <Td className="text-right tabular-nums">{c.employeeCount}</Td>
                    <Td>
                      <CompanyStatusBadge status={c.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{dateTime(c.createdAt, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE}
              total={total}
              onPage={setPage}
              labels={{
                previous: t('common.previous'),
                next: t('common.next'),
                summary: t('common.pageSummary', { from: (page - 1) * PAGE + 1, to: Math.min(page * PAGE, total), total }),
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
