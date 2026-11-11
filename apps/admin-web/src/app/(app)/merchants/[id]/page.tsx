'use client';

import type { CompanyStatus, PlanDto, PlatformCompanyDetailDto, SubscriptionStatus } from '@onepay/shared';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, Select, Skeleton, Table, Td, Th, useToast } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { dateTime, money } from '@onepay/web-core/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, PencilLine, RotateCcw, ScrollText, XCircle } from 'lucide-react';
import Link from 'next/link';
import { use, useState, type FormEvent, type ReactNode } from 'react';
import { CompanyStatusBadge, ConnStatusBadge, KeyValue, SubStatusBadge } from '@/components/common';
import { errorText, keys, useCanManage, useErrorToast } from '@/lib/hooks';
import { useI18n, type MessageKey } from '@/lib/i18n';

type Action = { to: CompanyStatus; label: MessageKey; icon: ReactNode; danger?: boolean };

function actionsFor(status: CompanyStatus): Action[] {
  const approve: Action = { to: 'ACTIVE', label: 'merchants.approve', icon: <CheckCircle2 className="size-4" /> };
  const reactivate: Action = { to: 'ACTIVE', label: 'merchants.activate', icon: <RotateCcw className="size-4" /> };
  const suspend: Action = { to: 'SUSPENDED', label: 'merchants.suspend', icon: <Ban className="size-4" />, danger: true };
  const close: Action = { to: 'CLOSED', label: 'merchants.closeAccount', icon: <XCircle className="size-4" />, danger: true };
  switch (status) {
    case 'PENDING':
      return [approve, close];
    case 'ACTIVE':
      return [suspend, close];
    case 'SUSPENDED':
      return [reactivate, close];
    case 'CLOSED':
      return [reactivate];
  }
}

/** YYYY-MM-DD (date input) → end of that day in Phnom Penh, as ISO. */
const endOfDayPP = (ymd: string) => new Date(`${ymd}T23:59:59+07:00`).toISOString();
const toDateInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : '');

export default function MerchantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const canManage = useCanManage();
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [subOpen, setSubOpen] = useState(false);
  const [sub, setSub] = useState({ planId: '', status: 'ACTIVE' as SubscriptionStatus, periodEnd: '', trialEnd: '' });

  const q = useQuery({ queryKey: keys.merchant(id), queryFn: () => api.get<PlatformCompanyDetailDto>(`platform/companies/${id}`) });
  const plans = useQuery({ queryKey: keys.plans, queryFn: () => api.get<PlanDto[]>('platform/plans'), enabled: subOpen });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.merchant(id) });
    void qc.invalidateQueries({ queryKey: ['merchants'] });
    void qc.invalidateQueries({ queryKey: keys.overview });
  };

  const setStatus = useMutation({
    mutationFn: (a: Action) => api.patch(`platform/companies/${id}/status`, { status: a.to, reason: reason.trim() || undefined }),
    onSuccess: () => {
      show({ tone: 'success', title: t('merchants.statusChanged') });
      setPending(null);
      setReason('');
      refresh();
    },
    onError: toastError,
  });

  const saveSub = useMutation({
    mutationFn: () =>
      api.patch(`platform/companies/${id}/subscription`, {
        planId: sub.planId || undefined,
        status: sub.status,
        currentPeriodEnd: sub.periodEnd ? endOfDayPP(sub.periodEnd) : undefined,
        trialEndsAt: sub.trialEnd ? endOfDayPP(sub.trialEnd) : undefined,
      }),
    onSuccess: () => {
      show({ tone: 'success', title: t('merchants.subscriptionSaved') });
      setSubOpen(false);
      refresh();
    },
    onError: toastError,
  });

  if (q.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  if (q.isError) {
    return <ErrorState title={t('common.somethingWrong')} message={errorText(q.error, t)} onRetry={() => void q.refetch()} retryLabel={t('common.retry')} />;
  }
  const c = q.data;

  function openSub() {
    setSub({
      planId: c.subscription?.plan.id ?? '',
      status: c.subscription?.status ?? 'ACTIVE',
      periodEnd: toDateInput(c.subscription?.currentPeriodEnd ?? null),
      trialEnd: toDateInput(c.subscription?.trialEndsAt ?? null),
    });
    setSubOpen(true);
  }

  return (
    <>
      <Link href="/merchants" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-brand">
        <ArrowLeft className="size-4" /> {t('merchants.back')}
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink" data-testid="merchant-name">
              {c.name}
            </h1>
            <span data-testid="merchant-status">
              <CompanyStatusBadge status={c.status} />
            </span>
          </div>
          <p className="mt-1 text-ink-2">
            {c.ownerEmail ?? '—'} · {t('merchants.joined')} {dateTime(c.createdAt, locale)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/audit?companyId=${c.id}`}>
            <Button variant="secondary" icon={<ScrollText className="size-4" />}>
              {t('merchants.viewAudit')}
            </Button>
          </Link>
          {canManage
            ? actionsFor(c.status).map((a) => (
                <Button key={a.to + a.label} variant={a.danger ? 'danger' : 'primary'} icon={a.icon} onClick={() => setPending(a)}>
                  {t(a.label)}
                </Button>
              ))
            : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="mb-2 font-semibold">{t('merchants.profile')}</h2>
          <dl className="divide-y divide-line">
            <KeyValue k={t('merchants.legalName')} v={c.legalName} />
            <KeyValue k={t('common.email')} v={c.email} />
            <KeyValue k={t('common.phone')} v={c.phone} />
            <KeyValue k={t('merchants.taxId')} v={c.taxId} />
            <KeyValue k={t('merchants.address')} v={c.address} />
            <KeyValue k={t('merchants.defaultCurrency')} v={c.defaultCurrency} />
          </dl>
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{t('merchants.subscription')}</h2>
            {canManage ? (
              <Button size="sm" variant="secondary" icon={<PencilLine className="size-4" />} onClick={openSub}>
                {t('common.edit')}
              </Button>
            ) : null}
          </div>
          {c.subscription ? (
            <dl className="divide-y divide-line" data-testid="subscription">
              <KeyValue k={t('merchants.plan')} v={`${c.subscription.plan.name} (${c.subscription.plan.code})`} />
              <KeyValue k={t('common.status')} v={<SubStatusBadge status={c.subscription.status} />} />
              <KeyValue
                k={t('common.amount')}
                v={`${money(c.subscription.plan.priceMinor, c.subscription.plan.currency, locale)} ${t(c.subscription.plan.interval === 'MONTH' ? 'plans.perMONTH' : 'plans.perYEAR')}`}
              />
              <KeyValue k={t('merchants.periodEnd')} v={dateTime(c.subscription.currentPeriodEnd, locale)} />
              {c.subscription.trialEndsAt ? <KeyValue k={t('merchants.trialEnds')} v={dateTime(c.subscription.trialEndsAt, locale)} /> : null}
            </dl>
          ) : (
            <p className="text-sm text-ink-3">{t('merchants.noSubscription')}</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 font-semibold">{t('merchants.volume')}</h2>
          {c.payments30d.length === 0 ? (
            <p className="text-sm text-ink-3">{t('merchants.noVolume')}</p>
          ) : (
            <div className="space-y-3">
              {c.payments30d.map((p) => (
                <div key={p.currency}>
                  <p className="text-2xl font-semibold tabular-nums">{money(p.amountMinor, p.currency, locale)}</p>
                  <p className="text-xs text-ink-3">{p.count} ×</p>
                </div>
              ))}
            </div>
          )}
          {c.simulatedPayments30d > 0 ? <p className="mt-3 text-xs text-ink-3">{t('merchants.simulated', { count: c.simulatedPayments30d })}</p> : null}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={`${t('merchants.members')} (${c.members.length})`} />
        <div className="mt-3">
          <Table>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('common.email')}</Th>
                <Th>{t('common.role')}</Th>
                <Th>{t('common.status')}</Th>
                <Th>{t('merchants.lastLogin')}</Th>
              </tr>
            </thead>
            <tbody data-testid="members-table">
              {c.members.map((m) => (
                <tr key={m.membershipId}>
                  <Td className="font-medium">{m.fullName}</Td>
                  <Td className="text-ink-2">{m.email}</Td>
                  <Td>{t(`roles.${m.role}`)}</Td>
                  <Td>{m.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</Td>
                  <Td className="text-ink-2">{m.lastLoginAt ? dateTime(m.lastLoginAt, locale) : t('common.never')}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={`${t('merchants.connections')} (${c.connections.length})`} />
          <div className="mt-3">
            {c.connections.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-ink-3">{t('merchants.noConnections')}</p>
            ) : (
              <ul className="divide-y divide-line" data-testid="connections-list">
                {c.connections.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.displayName}</p>
                      <p className="truncate text-xs text-ink-3">
                        {b.providerName} · {b.currency} · {b.accountNumberMasked ?? '—'} · {t('merchants.lastPayment')}:{' '}
                        {b.lastSyncedAt ? dateTime(b.lastSyncedAt, locale) : t('common.never')}
                      </p>
                    </div>
                    <ConnStatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={`${t('merchants.outletList')} (${c.outlets.length})`} />
          <ul className="mt-3 divide-y divide-line">
            {c.outlets.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {o.name} <code className="ml-1 rounded bg-surface px-1.5 py-0.5 text-xs">{o.code}</code>
                </span>
                {o.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        size="sm"
        title={pending ? t('merchants.confirmTitle', { action: t(pending.label), name: c.name }) : ''}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} loading={setStatus.isPending} onClick={() => pending && setStatus.mutate(pending)}>
              {pending ? t(pending.label) : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {pending?.danger ? <Alert tone="warning">{t('merchants.suspendWarning')}</Alert> : null}
          <Field label={`${t('common.reason')} (${t('common.optional')})`} hint={t('merchants.reasonHint')}>
            {(p) => <Input {...p} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </div>
      </Modal>

      <Modal
        open={subOpen}
        onClose={() => setSubOpen(false)}
        title={t('merchants.updateSubscription')}
        description={c.name}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="sub-form" loading={saveSub.isPending} disabled={!sub.planId}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="sub-form"
          className="space-y-4"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            saveSub.mutate();
          }}
        >
          <Field label={t('merchants.plan')}>
            {(p) => (
              <Select {...p} value={sub.planId} onChange={(e) => setSub({ ...sub, planId: e.target.value })}>
                <option value="" disabled>
                  —
                </option>
                {(plans.data ?? []).map((pl) => (
                  <option key={pl.id} value={pl.id} disabled={!pl.isActive && pl.id !== c.subscription?.plan.id}>
                    {pl.name} · {money(pl.priceMinor, pl.currency, locale)} {t(pl.interval === 'MONTH' ? 'plans.perMONTH' : 'plans.perYEAR')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('common.status')}>
            {(p) => (
              <Select {...p} value={sub.status} onChange={(e) => setSub({ ...sub, status: e.target.value as SubscriptionStatus })}>
                {(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`subStatus.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('merchants.periodEnd')}>
              {(p) => <Input {...p} type="date" value={sub.periodEnd} onChange={(e) => setSub({ ...sub, periodEnd: e.target.value })} />}
            </Field>
            <Field label={`${t('merchants.trialEnds')} (${t('common.optional')})`}>
              {(p) => <Input {...p} type="date" value={sub.trialEnd} onChange={(e) => setSub({ ...sub, trialEnd: e.target.value })} />}
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
