'use client';

import { Permission, type KhqrAccountDto, type KhqrChargeDto, type KhqrStatusDto } from '@onepay/shared';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton, useToast } from '@onepay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, QrCode, ShieldAlert, XCircle } from 'lucide-react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { errorText, useCan, useErrorToast, useOutletOptions } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

const KHQR_RED = '#E1232E';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [active]);
  return now;
}

export default function CollectPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const [connectionId, setConnectionId] = useState('');
  const [amount, setAmount] = useState('');
  const [outletId, setOutletId] = useState('');
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [svg, setSvg] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const status = useQuery({ queryKey: ['khqr-status'], queryFn: () => api.get<KhqrStatusDto>('khqr/status') });
  // Not bank-connections: cashiers may collect without being allowed to read bank connections.
  const accounts = useQuery({ queryKey: ['khqr-accounts'], queryFn: () => api.get<KhqrAccountDto[]>('khqr/accounts') });
  const khqrAccounts = accounts.data ?? [];
  const account = khqrAccounts.find((c) => c.id === connectionId) ?? khqrAccounts[0];
  const outlets = useOutletOptions(can(Permission.OUTLET_READ));

  const charge = useQuery({
    queryKey: ['khqr-charge', chargeId],
    queryFn: () => api.get<KhqrChargeDto>(`khqr/charges/${chargeId}`),
    enabled: !!chargeId,
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 2000 : false),
  });
  const c = charge.data;
  const now = useNow(c?.status === 'PENDING');
  const secondsLeft = c ? Math.max(0, Math.round((new Date(c.expiresAt).getTime() - now) / 1000)) : 0;

  useEffect(() => {
    if (!c?.qr) return setSvg('');
    let cancelled = false;
    void QRCode.toString(c.qr, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => {
      cancelled = true;
    };
  }, [c?.qr]);

  useEffect(() => {
    if (c?.status === 'PAID') void qc.invalidateQueries({ queryKey: ['transactions'] });
  }, [c?.status, qc]);

  const create = useMutation({
    mutationFn: () =>
      api.post<KhqrChargeDto>('khqr/charges', { bankConnectionId: account!.id, amount: amount.trim(), outletId: outletId || undefined }),
    onSuccess: (res) => {
      qc.setQueryData(['khqr-charge', res.id], res);
      setChargeId(res.id);
    },
    onError: (e) => setFormError(errorText(e, t)),
  });
  const cancel = useMutation({
    mutationFn: () => api.post<KhqrChargeDto>(`khqr/charges/${chargeId}/cancel`),
    onSuccess: (res) => qc.setQueryData(['khqr-charge', res.id], res),
    onError: toastError,
  });
  const simulate = useMutation({
    mutationFn: () => api.post<KhqrChargeDto>(`khqr/charges/${chargeId}/simulate-paid`),
    onSuccess: (res) => qc.setQueryData(['khqr-charge', res.id], res),
    onError: toastError,
  });

  function reset(keepAmount = false) {
    setChargeId(null);
    setSvg('');
    setFormError(null);
    if (!keepAmount) setAmount('');
  }

  if (status.isError || accounts.isError) {
    const failed = status.isError ? status : accounts;
    return (
      <>
        <PageHeader title={t('collect.title')} />
        <Card className="max-w-xl">
          <ErrorState title={t('common.somethingWrong')} message={errorText(failed.error, t)} onRetry={() => void failed.refetch()} retryLabel={t('common.retry')} />
        </Card>
      </>
    );
  }
  if (status.isPending || accounts.isPending) {
    return (
      <>
        <PageHeader title={t('collect.title')} />
        <Skeleton className="h-80 max-w-xl" />
      </>
    );
  }
  if (status.data?.mode === 'off') {
    return (
      <>
        <PageHeader title={t('collect.title')} />
        <Card>
          <EmptyState icon={<QrCode className="size-6" />} title={t('collect.notAvailable')} />
        </Card>
      </>
    );
  }
  if (khqrAccounts.length === 0) {
    return (
      <>
        <PageHeader title={t('collect.title')} subtitle={t('collect.subtitle')} />
        <Card>
          <EmptyState
            icon={<QrCode className="size-6" />}
            title={t('collect.noAccount')}
            action={
              can(Permission.BANK_CONNECTION_MANAGE) ? (
                <Link href="/bank-connections?connect=1">
                  <Button>{t('collect.connectAccount')}</Button>
                </Link>
              ) : null
            }
          />
        </Card>
      </>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60));
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <>
      <PageHeader title={t('collect.title')} subtitle={t('collect.subtitle')} />
      {status.data?.mode === 'simulated' ? (
        <Alert tone="warning" className="mb-4 max-w-xl">
          {t('collect.demoMode')}
        </Alert>
      ) : null}

      {!c ? (
        <Card className="max-w-xl p-6">
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setFormError(null);
              create.mutate();
            }}
          >
            {khqrAccounts.length > 1 ? (
              <Field label={t('collect.account')}>
                {(p) => (
                  <Select {...p} value={account?.id ?? ''} onChange={(e) => setConnectionId(e.target.value)}>
                    {khqrAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName} · {a.accountId} · {a.currency}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <p className="text-sm text-ink-2">
                {account?.displayName} · <span className="font-medium text-ink">{account?.accountId}</span> · {account?.currency}
              </p>
            )}
            <Field label={`${t('collect.amount')} (${account?.currency})`}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  autoFocus
                  className="h-14 text-2xl font-semibold tabular-nums"
                  placeholder={account?.currency === 'KHR' ? '40000' : '12.50'}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  data-testid="collect-amount"
                />
              )}
            </Field>
            {outlets.data && outlets.data.length > 1 ? (
              <Field label={t('collect.outlet')}>
                {(p) => (
                  <Select {...p} value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                    <option value="">—</option>
                    {outlets.data.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <Button type="submit" size="lg" className="w-full" icon={<QrCode className="size-5" />} loading={create.isPending} disabled={!amount} data-testid="show-khqr">
              {t('collect.showQr')}
            </Button>
          </form>
        </Card>
      ) : c.status === 'PENDING' ? (
        <div className="max-w-sm" data-testid="khqr-card">
          <div className="overflow-hidden rounded-3xl bg-white shadow-pop ring-1 ring-line">
            <div className="flex items-center justify-between px-6 py-4 text-white" style={{ background: KHQR_RED }}>
              <span className="text-xl font-extrabold tracking-wide">KHQR</span>
              <span className="text-xs opacity-90">{t('collect.scanHint')}</span>
            </div>
            <div className="px-6 pt-5">
              <p className="text-sm font-medium text-ink-2">{c.merchantName}</p>
              <p className="text-3xl font-bold tracking-tight text-ink tabular-nums" data-testid="khqr-amount">
                {money(c.amountMinor, c.currency, locale)}
              </p>
            </div>
            <div className="mx-6 my-4 border-t border-dashed border-line" />
            <div className="mx-auto w-64 pb-2" aria-label="KHQR" role="img" dangerouslySetInnerHTML={{ __html: svg }} data-testid="khqr-qr" />
            <div className="flex items-center justify-between px-6 pb-5 text-xs text-ink-3">
              <span>
                {t('collect.reference')} {c.reference}
              </span>
              <span className="flex items-center gap-1 tabular-nums">
                <Clock className="size-3.5" aria-hidden />
                {t('collect.expiresIn', { time: `${mm}:${ss}` })}
              </span>
            </div>
          </div>
          <p className="mt-4 animate-pulse text-center text-sm text-ink-2">{t('collect.waiting')}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              {t('collect.cancel')}
            </Button>
            {c.simulated ? (
              <Button className="flex-1" loading={simulate.isPending} onClick={() => simulate.mutate()} data-testid="simulate-paid">
                {t('collect.simulatePaid')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Card className="max-w-sm p-8 text-center" data-testid="khqr-result" data-status={c.status}>
          {c.status === 'PAID' ? (
            <>
              <CheckCircle2 className="mx-auto size-16 text-success" aria-hidden />
              <p className="mt-3 text-lg font-semibold text-ink">{t('collect.paidTitle')}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{money(c.amountMinor, c.currency, locale)}</p>
              {c.payerAccount ? <p className="mt-2 text-sm text-ink-2">{t('collect.paidFrom', { account: c.payerAccount })}</p> : null}
              <p className="mt-1 text-xs text-ink-3">
                {t('collect.reference')} {c.reference}
              </p>
            </>
          ) : c.status === 'REVIEW' ? (
            <>
              <ShieldAlert className="mx-auto size-16 text-pending" aria-hidden />
              <p className="mt-3 text-lg font-semibold text-ink">{t('collect.reviewTitle')}</p>
              <p className="mt-2 text-sm text-ink-2">{t('collect.reviewText')}</p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto size-16 text-ink-3" aria-hidden />
              <p className="mt-3 text-lg font-semibold text-ink">{c.status === 'EXPIRED' ? t('collect.expiredTitle') : t('collect.canceledTitle')}</p>
              {c.status === 'EXPIRED' ? <p className="mt-2 text-sm text-ink-2">{t('collect.expiredText')}</p> : null}
            </>
          )}
          <Button
            className="mt-6 w-full"
            onClick={() => {
              if (c.status === 'PAID') show({ tone: 'success', title: t('collect.paidTitle') });
              reset(c.status !== 'PAID');
            }}
            data-testid="new-payment"
          >
            {t('collect.newPayment')}
          </Button>
        </Card>
      )}
    </>
  );
}
