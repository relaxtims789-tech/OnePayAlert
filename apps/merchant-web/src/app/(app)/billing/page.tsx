'use client';

import { BILLING_GRACE_DAYS, Permission, type BillingOverviewDto, type InvoiceDto, type Paginated, type PlanResource } from '@onepay/shared';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, Skeleton, Table, TableSkeleton, Td, Th, useToast, type Tone, cn } from '@onepay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, Receipt } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { dateTime, money, shortDate } from '@/lib/format';
import { errorText, useCan, useErrorToast } from '@/lib/hooks';
import { useI18n, type MessageKey } from '@/lib/i18n';

const DAY = 86_400_000;
const ymd = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

const STATUS_TONE: Record<string, Tone> = { TRIALING: 'brand', ACTIVE: 'success', PAST_DUE: 'pending', CANCELED: 'neutral', EXPIRED: 'failed' };
const INVOICE_TONE: Record<string, Tone> = { OPEN: 'pending', PAID: 'success', VOID: 'neutral' };
const USAGE: { key: PlanResource; label: MessageKey }[] = [
  { key: 'outlets', label: 'billing.outlets' },
  { key: 'employees', label: 'billing.employees' },
  { key: 'bankConnections', label: 'billing.bankConnections' },
  { key: 'devices', label: 'billing.devices' },
];

export default function BillingPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const qc = useQueryClient();
  const toastError = useErrorToast();
  const { show } = useToast();
  const canManage = can(Permission.SUBSCRIPTION_MANAGE);
  const [choosing, setChoosing] = useState<BillingOverviewDto['plans'][number] | null>(null);

  const overview = useQuery({ queryKey: ['billing'], queryFn: () => api.get<BillingOverviewDto>('billing'), enabled: can(Permission.SUBSCRIPTION_READ) });
  const invoices = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: () => api.get<Paginated<InvoiceDto>>('billing/invoices', { pageSize: 50 }),
    enabled: can(Permission.SUBSCRIPTION_READ),
  });
  const checkout = useMutation({
    mutationFn: (planId: string) => api.post<InvoiceDto>('billing/checkout', { planId }),
    onSuccess: async (inv) => {
      setChoosing(null);
      show({ tone: 'success', title: t('billing.invoiceCreated', { number: inv.number }) });
      await qc.invalidateQueries({ queryKey: ['billing'] });
      await qc.invalidateQueries({ queryKey: ['billing-invoices'] });
    },
    onError: toastError,
  });

  if (!can(Permission.SUBSCRIPTION_READ)) {
    return (
      <>
        <PageHeader title={t('billing.title')} />
        <Card>
          <EmptyState icon={<CreditCard className="size-6" />} title={t('common.forbidden')} />
        </Card>
      </>
    );
  }
  if (overview.isError) {
    return (
      <>
        <PageHeader title={t('billing.title')} />
        <Card>
          <ErrorState title={t('common.somethingWrong')} message={errorText(overview.error, t)} onRetry={() => void overview.refetch()} retryLabel={t('common.retry')} />
        </Card>
      </>
    );
  }

  const o = overview.data;
  const sub = o?.subscription ?? null;
  const open = o?.openInvoice ?? null;

  let statusLine: string | null = null;
  if (sub?.status === 'TRIALING' && sub.trialEndsAt) statusLine = t('billing.trialEnds', { date: shortDate(ymd(sub.trialEndsAt), locale) });
  else if (sub?.status === 'ACTIVE') statusLine = t('billing.paidUntil', { date: shortDate(ymd(sub.currentPeriodEnd), locale) });

  return (
    <>
      <PageHeader title={t('billing.title')} subtitle={t('billing.subtitle')} />

      {sub?.status === 'PAST_DUE' ? (
        <Alert tone="warning" className="mb-6">
          {t('billing.overdue', {
            date: shortDate(ymd(sub.currentPeriodEnd), locale),
            grace: shortDate(ymd(new Date(new Date(sub.currentPeriodEnd).getTime() + BILLING_GRACE_DAYS * DAY).toISOString()), locale),
          })}
        </Alert>
      ) : sub && (sub.status === 'EXPIRED' || sub.status === 'CANCELED') ? (
        <Alert tone="error" className="mb-6">
          {t('billing.ended')}
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-5" data-testid="current-plan">
          <p className="text-sm font-medium text-ink-2">{t('billing.currentPlan')}</p>
          {overview.isPending ? (
            <Skeleton className="mt-3 h-10 w-40" />
          ) : sub ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight text-ink">{sub.plan.name}</p>
                <Badge tone={STATUS_TONE[sub.status]}>{t(`billingStatus.${sub.status}`)}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-2 tabular-nums">
                {money(sub.plan.priceMinor, sub.plan.currency, locale)} {t(`billing.per${sub.plan.interval}`)}
              </p>
              {statusLine ? <p className="mt-3 text-sm text-ink-2">{statusLine}</p> : null}
            </>
          ) : (
            <p className="mt-2 text-ink-2">—</p>
          )}

          <p className="mt-6 text-sm font-semibold text-ink">{t('billing.usage')}</p>
          <ul className="mt-3 space-y-3" data-testid="usage">
            {USAGE.map(({ key, label }) => {
              const u = o?.usage[key];
              const pct = u && u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
              const over = !!u && u.used > u.limit;
              const full = !!u && u.used >= u.limit;
              return (
                <li key={key}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-2">{t(label)}</span>
                    <span className="flex items-center gap-2 font-medium text-ink tabular-nums">
                      {u ? t('billing.usedOf', { used: u.used, limit: u.limit }) : '—'}
                      {over ? <Badge tone="failed">{t('billing.overLimit')}</Badge> : full ? <Badge tone="pending">{t('billing.atLimit')}</Badge> : null}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
                    <div className={cn('h-full rounded-full', over ? 'bg-failed' : full ? 'bg-pending' : 'bg-brand')} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {open ? (
          <Card className="border-brand/30 p-5" data-testid="open-invoice">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink-2">{t('billing.openInvoice')}</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-ink tabular-nums">{money(open.amountMinor, open.currency, locale)}</p>
                <p className="mt-1 text-sm text-ink-2">
                  {open.plan.name} · {t(`invoiceKind.${open.kind}`)}
                </p>
              </div>
              <div className="text-right">
                <Badge tone="pending">{t('invoiceStatus.OPEN')}</Badge>
                <p className="mt-2 text-sm font-medium text-ink">{open.number}</p>
                <p className="text-xs text-ink-3">{t('billing.due', { date: shortDate(ymd(open.dueAt), locale) })}</p>
              </div>
            </div>
            <div className="mt-5 rounded-xl bg-surface p-4 text-sm">
              <p className="font-semibold text-ink">{t('billing.howToPay')}</p>
              <p className="mt-1 whitespace-pre-line text-ink-2">{o?.paymentInstructions}</p>
              <p className="mt-2 font-medium text-ink">{t('billing.quoteNumber', { number: open.number })}</p>
            </div>
            <p className="mt-3 text-xs text-ink-3">{t('billing.activationNote')}</p>
          </Card>
        ) : (
          <Card className="grid place-items-center p-5">
            <EmptyState icon={<Receipt className="size-6" />} title={t('billing.noInvoices')} className="py-6" />
          </Card>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader title={t('billing.plans')} subtitle={canManage ? undefined : t('billing.ownerOnly')} />
        <div className="grid gap-4 p-5 md:grid-cols-3" data-testid="plans">
          {overview.isPending
            ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-56" />)
            : o?.plans.map((p) => {
                const mine = sub?.plan.id === p.id;
                const current = mine && (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE');
                const trial = mine && sub.status === 'TRIALING';
                const awaiting = open?.plan.id === p.id;
                // Paying for the plan you were on (after it lapsed) is a renewal; a trial user is subscribing.
                const renewable = mine && (sub.status === 'PAST_DUE' || sub.status === 'EXPIRED' || sub.status === 'CANCELED');
                const offer = canManage && !awaiting && !(mine && sub.status === 'ACTIVE');
                return (
                  <div key={p.id} className={cn('flex flex-col rounded-2xl border p-5', current || trial ? 'border-brand bg-brand-50/40' : 'border-line')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-lg font-semibold text-ink">{p.name}</p>
                      {awaiting ? (
                        <Badge tone="pending">{t('billing.awaitingPayment')}</Badge>
                      ) : current ? (
                        <Badge tone="brand">{t('billing.yourPlan')}</Badge>
                      ) : trial ? (
                        <Badge tone="brand">{t('billingStatus.TRIALING')}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                      {money(p.priceMinor, p.currency, locale)} <span className="text-sm font-normal text-ink-2">{t(`billing.per${p.interval}`)}</span>
                    </p>
                    <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">
                      {[
                        t('billing.featureOutlets', { n: p.maxOutlets }),
                        t('billing.featureEmployees', { n: p.maxEmployees }),
                        t('billing.featureConnections', { n: p.maxBankConns }),
                        t('billing.featureDevices', { n: p.maxDevices }),
                      ].map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <Check className="size-4 shrink-0 text-success" aria-hidden />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {offer ? (
                      <Button className="mt-5" variant={renewable ? 'primary' : 'secondary'} onClick={() => setChoosing(p)} data-testid={`choose-${p.code}`}>
                        {renewable ? t('billing.renew', { plan: p.name }) : t('billing.choose', { plan: p.name })}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('billing.invoices')} />
        <div className="mt-3">
          {invoices.isPending ? (
            <TableSkeleton cols={5} rows={3} />
          ) : invoices.isError ? (
            <ErrorState title={t('common.somethingWrong')} message={errorText(invoices.error, t)} onRetry={() => void invoices.refetch()} retryLabel={t('common.retry')} />
          ) : invoices.data.items.length === 0 ? (
            <EmptyState icon={<Receipt className="size-6" />} title={t('billing.noInvoices')} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t('billing.invoice')}</Th>
                  <Th>{t('billing.issued')}</Th>
                  <Th>{t('billing.period')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th className="text-right">{t('common.amount')}</Th>
                </tr>
              </thead>
              <tbody data-testid="invoices">
                {invoices.data.items.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <p className="font-medium text-ink">{i.number}</p>
                      <p className="text-xs text-ink-3">
                        {i.plan.name} · {t(`invoiceKind.${i.kind}`)}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{dateTime(i.createdAt, locale)}</Td>
                    <Td className="whitespace-nowrap text-ink-2">
                      {i.periodStart && i.periodEnd ? `${shortDate(ymd(i.periodStart), locale)} – ${shortDate(ymd(i.periodEnd), locale)}` : '—'}
                    </Td>
                    <Td>
                      <Badge tone={INVOICE_TONE[i.status]}>{t(`invoiceStatus.${i.status}`)}</Badge>
                      {i.paidAt ? <p className="mt-1 text-xs text-ink-3">{t('billing.paidOn', { date: shortDate(ymd(i.paidAt), locale) })}</p> : null}
                    </Td>
                    <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{money(i.amountMinor, i.currency, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      <Modal
        open={!!choosing}
        onClose={() => setChoosing(null)}
        title={choosing ? t('billing.confirmTitle', { plan: choosing.name }) : ''}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setChoosing(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => choosing && checkout.mutate(choosing.id)} loading={checkout.isPending} data-testid="confirm-checkout">
              {t('billing.confirm')}
            </Button>
          </>
        }
      >
        {choosing ? <p className="text-sm text-ink-2">{t('billing.confirmText', { amount: money(choosing.priceMinor, choosing.currency, locale) })}</p> : null}
      </Modal>
    </>
  );
}
