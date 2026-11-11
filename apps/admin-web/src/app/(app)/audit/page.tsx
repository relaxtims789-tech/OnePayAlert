'use client';

import type { Paginated, PlatformAuditDto } from '@onepay/shared';
import { Button, Card, EmptyState, ErrorState, Input, Modal, Pagination, Table, TableSkeleton, Td, Th } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { dateTime } from '@onepay/web-core/format';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PageHeader } from '@/components/common';
import { errorText, keys } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

const PAGE = 25;

function AuditInner() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const companyId = params.get('companyId') ?? undefined;
  const [actionInput, setActionInput] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PlatformAuditDto | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setAction(actionInput.trim().toLowerCase()), 300);
    return () => clearTimeout(h);
  }, [actionInput]);
  useEffect(() => setPage(1), [action, companyId]);

  const valid = action === '' || /^[a-z_.]{1,80}$/.test(action);
  const q = { page, pageSize: PAGE, companyId, action: valid && action ? action : undefined };
  const logs = useQuery({
    queryKey: keys.audit(q),
    queryFn: () => api.get<Paginated<PlatformAuditDto>>('platform/audit-logs', q),
    placeholderData: keepPreviousData,
  });
  const total = logs.data?.total ?? 0;
  const companyName = companyId ? logs.data?.items.find((i) => i.companyId === companyId)?.companyName : null;

  return (
    <>
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
          <Input
            aria-label={t('audit.action')}
            placeholder={t('audit.actionFilter')}
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            className="sm:max-w-sm"
          />
          <Button variant={action === 'platform.' ? 'primary' : 'secondary'} size="md" onClick={() => setActionInput(action === 'platform.' ? '' : 'platform.')}>
            {t('audit.platformOnly')}
          </Button>
          {companyId ? (
            <Button variant="secondary" size="md" icon={<X className="size-4" />} onClick={() => router.replace('/audit')}>
              {companyName ?? t('audit.company')} · {t('audit.clearFilter')}
            </Button>
          ) : null}
        </div>
        {logs.isPending ? (
          <TableSkeleton cols={5} />
        ) : logs.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(logs.error, t)} onRetry={() => void logs.refetch()} retryLabel={t('common.retry')} />
        ) : logs.data.items.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-6" />} title={t('audit.empty')} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t('audit.when')}</Th>
                  <Th>{t('audit.action')}</Th>
                  <Th>{t('audit.actor')}</Th>
                  <Th>{t('audit.company')}</Th>
                  <Th>{t('audit.ip')}</Th>
                </tr>
              </thead>
              <tbody data-testid="audit-table">
                {logs.data.items.map((l) => (
                  <tr key={l.id} className="cursor-pointer hover:bg-surface/70" onClick={() => setSelected(l)}>
                    <Td className="whitespace-nowrap text-ink-2">{dateTime(l.createdAt, locale)}</Td>
                    <Td>
                      <code className="text-xs">{l.action}</code>
                    </Td>
                    <Td className="text-ink-2">{l.actorEmail ?? '—'}</Td>
                    <Td>
                      {l.companyId ? (
                        <Link href={`/merchants/${l.companyId}`} className="hover:text-brand" onClick={(e) => e.stopPropagation()}>
                          {l.companyName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-ink-3">{l.ipAddress ?? '—'}</Td>
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
      <Modal open={!!selected} onClose={() => setSelected(null)} title={t('audit.details')} description={selected?.action} closeLabel={t('common.close')}>
        <pre className="overflow-x-auto rounded-xl bg-surface p-4 text-xs leading-relaxed" data-testid="audit-details">
          {selected ? JSON.stringify({ entity: `${selected.entityType}:${selected.entityId ?? '—'}`, metadata: selected.metadata }, null, 2) : ''}
        </pre>
      </Modal>
    </>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditInner />
    </Suspense>
  );
}
