'use client';

import { type InvoiceDto, type InvoiceStatus, type Paginated, type PaymentMethod } from '@onepay/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Pagination, Segmented, Select, Table, TableSkeleton, Td, Th, useToast, type Tone } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { dateTime, money } from '@onepay/web-core/format';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReceiptText, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/common';
import { errorText, useCanManage, useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

const PAGE_SIZE = 25;
const TONE: Record<InvoiceStatus, Tone> = { OPEN: 'pending', PAID: 'success', VOID: 'neutral' };
const ymd = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const todayPP = () => ymd(new Date().toISOString());

export default function InvoicesPage() {
  const { t, locale } = useI18n();
  const canManage = useCanManage();
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const [status, setStatus] = useState<InvoiceStatus | 'ALL'>('OPEN');
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState<InvoiceDto | null>(null);
  const [voiding, setVoiding] = useState<InvoiceDto | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayPP());
  const [error, setError] = useState<string | null>(null);

  const params = { page, pageSize: PAGE_SIZE, status: status === 'ALL' ? undefined : status };
  const list = useQuery({
    queryKey: ['invoices', params],
    queryFn: () => api.get<Paginated<InvoiceDto>>('platform/invoices', params),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['invoices'] });

  const markPaid = useMutation({
    mutationFn: (inv: InvoiceDto) =>
      api.post<InvoiceDto>(`platform/invoices/${inv.id}/mark-paid`, {
        paymentMethod: method,
        paymentReference: reference.trim() || undefined,
        // Noon Phnom Penh time on the chosen day; today means "now".
        paidAt: paidOn === todayPP() ? undefined : new Date(`${paidOn}T05:00:00Z`).toISOString(),
      }),
    onSuccess: (inv) => {
      show({ tone: 'success', title: t('invoices.paidDone', { number: inv.number }) });
      setPaying(null);
      void refresh();
    },
    onError: (e) => setError(errorText(e, t)),
  });
  const voidInvoice = useMutation({
    mutationFn: (inv: InvoiceDto) => api.post<InvoiceDto>(`platform/invoices/${inv.id}/void`),
    onSuccess: (inv) => {
      show({ tone: 'success', title: t('invoices.voidDone', { number: inv.number }) });
      setVoiding(null);
      void refresh();
    },
    onError: toastError,
  });
  const lifecycle = useMutation({
    mutationFn: () =>
      api.post<{ trialsExpired: number; renewalInvoicesIssued: number; pastDue: number; expired: number }>('platform/billing/run-lifecycle'),
    onSuccess: (r) => {
      show({
        tone: 'success',
        title: t('invoices.lifecycleDone', { issued: r.renewalInvoicesIssued, pastDue: r.pastDue, expired: r.expired, trials: r.trialsExpired }),
      });
      void refresh();
    },
    onError: toastError,
  });

  function openPay(inv: InvoiceDto) {
    setMethod('BANK_TRANSFER');
    setReference('');
    setPaidOn(todayPP());
    setError(null);
    setPaying(inv);
  }

  const total = list.data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        actions={
          canManage ? (
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={lifecycle.isPending} onClick={() => lifecycle.mutate()}>
              {t('invoices.runLifecycle')}
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="border-b border-line p-4">
          <Segmented
            value={status}
            onChange={(s) => {
              setStatus(s);
              setPage(1);
            }}
            ariaLabel={t('common.status')}
            options={[
              { value: 'OPEN', label: t('invoiceStatus.OPEN') },
              { value: 'PAID', label: t('invoiceStatus.PAID') },
              { value: 'VOID', label: t('invoiceStatus.VOID') },
              { value: 'ALL', label: t('invoices.all') },
            ]}
          />
        </div>
        {list.isPending ? (
          <TableSkeleton cols={6} />
        ) : list.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(list.error, t)} onRetry={() => void list.refetch()} retryLabel={t('common.retry')} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<ReceiptText className="size-6" />} title={t('invoices.empty')} />
        ) : (
          <>
            <Table className={list.isFetching ? 'opacity-70 transition-opacity' : undefined}>
              <thead>
                <tr>
                  <Th>{t('invoices.invoice')}</Th>
                  <Th>{t('invoices.merchant')}</Th>
                  <Th>{t('invoices.plan')}</Th>
                  <Th>{t('invoices.due')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th className="text-right">{t('common.amount')}</Th>
                  {canManage ? <Th className="text-right">{t('common.actions')}</Th> : null}
                </tr>
              </thead>
              <tbody data-testid="invoices-table">
                {list.data.items.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <p className="font-medium">{i.number}</p>
                      <p className="text-xs text-ink-3">{dateTime(i.createdAt, locale)}</p>
                    </Td>
                    <Td>
                      <Link href={`/merchants/${i.companyId}`} className="font-medium text-brand hover:underline">
                        {i.companyName ?? i.companyId}
                      </Link>
                    </Td>
                    <Td className="text-ink-2">
                      {i.plan.name}
                      <p className="text-xs text-ink-3">{t(`invoiceKind.${i.kind}`)}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{ymd(i.dueAt)}</Td>
                    <Td>
                      <Badge tone={TONE[i.status]}>{t(`invoiceStatus.${i.status}`)}</Badge>
                      {i.paidAt ? (
                        <p className="mt-1 text-xs text-ink-3">
                          {ymd(i.paidAt)} · {i.paymentMethod ? t(`invoices.${i.paymentMethod}`) : ''}
                          {i.paymentReference ? ` · ${i.paymentReference}` : ''}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{money(i.amountMinor, i.currency, locale)}</Td>
                    {canManage ? (
                      <Td className="text-right whitespace-nowrap">
                        {i.status === 'OPEN' ? (
                          <>
                            <Button size="sm" onClick={() => openPay(i)} data-testid={`mark-paid-${i.number}`}>
                              {t('invoices.markPaid')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setVoiding(i)}>
                              {t('invoices.void')}
                            </Button>
                          </>
                        ) : null}
                      </Td>
                    ) : null}
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

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title={paying ? t('invoices.markPaidTitle', { number: paying.number }) : ''}
        description={paying ? t('invoices.markPaidHint', { merchant: paying.companyName ?? '', amount: money(paying.amountMinor, paying.currency, locale) }) : undefined}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaying(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="pay-form" loading={markPaid.isPending} data-testid="confirm-paid">
              {t('invoices.confirmPaid')}
            </Button>
          </>
        }
      >
        <form
          id="pay-form"
          className="space-y-4"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setError(null);
            if (paying) markPaid.mutate(paying);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('invoices.method')}>
              {(p) => (
                <Select {...p} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {(['BANK_TRANSFER', 'CASH', 'OTHER'] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`invoices.${m}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('invoices.paidAt')}>{(p) => <Input {...p} type="date" max={todayPP()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}</Field>
          </div>
          <Field label={t('invoices.reference')}>
            {(p) => <Input {...p} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} data-testid="payment-reference" />}
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
        </form>
      </Modal>

      <Modal
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title={voiding ? t('invoices.voidTitle', { number: voiding.number }) : ''}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoiding(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={voidInvoice.isPending} onClick={() => voiding && voidInvoice.mutate(voiding)}>
              {t('invoices.void')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">{t('invoices.voidText')}</p>
      </Modal>
    </>
  );
}
