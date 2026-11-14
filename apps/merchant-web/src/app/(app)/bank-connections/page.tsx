'use client';

import {
  Permission,
  type BankConnectionDto,
  type BankConnectionWithSecretDto,
  type Paginated,
  type PaymentProviderDto,
  type RelayPhoneDto,
} from '@onepay/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, cn, useToast } from '@onepay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, FlaskConical, Landmark, Plus, RefreshCw, Smartphone, Unplug } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { ConnectionStatus, DemoBadge } from '@/components/status';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { errorText, queryKeys, useCan, useErrorToast, useOutletOptions } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs break-all" data-testid="secret-value">
          {value}
        </code>
        <Button
          variant="secondary"
          size="md"
          aria-label={t('common.copy')}
          icon={copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        />
      </div>
    </div>
  );
}

function BankConnectionsInner() {
  const { t, locale } = useI18n();
  const can = useCan();
  const canManage = can(Permission.BANK_CONNECTION_MANAGE);
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const params = useSearchParams();

  const [connectOpen, setConnectOpen] = useState(false);
  const [provider, setProvider] = useState<PaymentProviderDto | null>(null);
  const [draft, setDraft] = useState({ displayName: '', accountName: '', accountNumber: '', externalAccountId: '', currency: 'USD' as 'USD' | 'KHR', outletId: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<BankConnectionWithSecretDto | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'rotate' | 'disconnect'; conn: BankConnectionDto } | null>(null);
  const [simulating, setSimulating] = useState<BankConnectionDto | null>(null);
  const [sim, setSim] = useState({ amount: '12.50', payerName: '' });

  useEffect(() => {
    if (params.get('connect') && canManage) setConnectOpen(true);
  }, [params, canManage]);

  const list = useQuery({
    queryKey: queryKeys.connections,
    queryFn: () => api.get<Paginated<BankConnectionDto>>('bank-connections', { pageSize: 100 }),
  });
  const providers = useQuery({ queryKey: queryKeys.providers, queryFn: () => api.get<PaymentProviderDto[]>('payment-providers'), enabled: canManage });
  const outlets = useOutletOptions(can(Permission.OUTLET_READ));
  const outletName = (id: string | null) => (id ? outlets.data?.find((o) => o.id === id)?.name : null);
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.connections });

  const create = useMutation({
    mutationFn: () =>
      api.post<BankConnectionWithSecretDto>('bank-connections', {
        providerId: provider!.id,
        displayName: draft.displayName,
        accountName: draft.accountName || undefined,
        accountNumber: draft.accountNumber || undefined,
        externalAccountId: draft.externalAccountId || undefined,
        currency: draft.currency,
        outletId: draft.outletId || undefined,
      }),
    onSuccess: (c) => {
      show({ tone: 'success', title: t('banks.connected') });
      setConnectOpen(false);
      setProvider(null);
      if (c.webhookSecret) setSecret(c);
      refresh();
    },
    onError: (e) => setFormError(errorText(e, t)),
  });

  const act = useMutation({
    mutationFn: async ({ kind, conn }: { kind: 'rotate' | 'disconnect'; conn: BankConnectionDto }) =>
      kind === 'rotate'
        ? api.post<BankConnectionWithSecretDto>(`bank-connections/${conn.id}/rotate-webhook-secret`)
        : api.del<BankConnectionDto>(`bank-connections/${conn.id}`),
    onSuccess: (res, { kind }) => {
      setConfirm(null);
      if (kind === 'rotate') setSecret(res as BankConnectionWithSecretDto);
      else show({ tone: 'success', title: t('banks.disconnected') });
      refresh();
    },
    onError: toastError,
  });

  const simulate = useMutation({
    mutationFn: () => api.post(`bank-connections/${simulating!.id}/simulate-payment`, { amount: sim.amount, payerName: sim.payerName || undefined }),
    onSuccess: () => {
      show({ tone: 'success', title: t('banks.simulatedSent') });
      setSimulating(null);
    },
    onError: toastError,
  });

  function startConnect() {
    setProvider(null);
    setFormError(null);
    setDraft({ displayName: '', accountName: '', accountNumber: '', externalAccountId: '', currency: 'USD', outletId: '' });
    setConnectOpen(true);
  }

  return (
    <>
      <PageHeader
        title={t('banks.title')}
        subtitle={t('banks.subtitle')}
        actions={canManage ? <Button icon={<Plus className="size-4" />} onClick={startConnect}>{t('banks.connect')}</Button> : null}
      />

      {list.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-card" />
          ))}
        </div>
      ) : list.isError ? (
        <Card>
          <ErrorState title={t('common.somethingWrong')} message={errorText(list.error, t)} onRetry={() => void list.refetch()} retryLabel={t('common.retry')} />
        </Card>
      ) : list.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark className="size-6" />}
            title={t('banks.empty')}
            description={t('banks.emptyHint')}
            action={canManage ? <Button onClick={startConnect}>{t('banks.connect')}</Button> : null}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="connections-grid">
          {list.data.items.map((c) => {
            const live = c.status !== 'DISCONNECTED';
            return (
              <Card key={c.id} className={cn('flex flex-col p-5', !live && 'opacity-60')} data-testid="connection-card">
                <div className="flex items-start gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                    <Landmark className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{c.displayName}</p>
                    <p className="truncate text-sm text-ink-2">
                      {c.provider.name} {c.provider.isDemo ? <DemoBadge /> : null}
                    </p>
                  </div>
                  <ConnectionStatus status={c.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-ink-3">{t('banks.account')}</dt>
                  <dd className="text-right text-ink">{c.externalAccountId ?? c.accountNumberMasked ?? '—'}</dd>
                  <dt className="text-ink-3">{t('common.currency')}</dt>
                  <dd className="text-right text-ink">{c.currency}</dd>
                  <dt className="text-ink-3">{t('common.outlet')}</dt>
                  <dd className="truncate text-right text-ink">{outletName(c.outletId) ?? '—'}</dd>
                  <dt className="text-ink-3">{t('banks.lastSynced')}</dt>
                  <dd className="text-right text-ink">{c.lastSyncedAt ? dateTime(c.lastSyncedAt, locale) : t('banks.never')}</dd>
                </dl>
                {c.provider.code === 'PHONE_ALERTS' && live ? <RelayPhones connectionId={c.id} canManage={canManage} /> : null}
                {c.status === 'PENDING' && !c.webhookUrl && !c.provider.isDemo ? (
                  <Alert tone="warning" className="mt-4">
                    {t('banks.pendingIntegration')}
                  </Alert>
                ) : null}
                {canManage && live ? (
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {c.provider.isDemo ? (
                      <Button size="sm" icon={<FlaskConical className="size-4" />} onClick={() => setSimulating(c)}>
                        {t('banks.simulate')}
                      </Button>
                    ) : null}
                    {c.webhookUrl ? (
                      <Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => setConfirm({ kind: 'rotate', conn: c })}>
                        {t('banks.rotate')}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" icon={<Unplug className="size-4" />} onClick={() => setConfirm({ kind: 'disconnect', conn: c })}>
                      {t('banks.disconnect')}
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {/* Connect flow: choose provider → details */}
      <Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title={t('banks.connectTitle')}
        description={provider ? provider.name : t('banks.chooseProvider')}
        size="lg"
        closeLabel={t('common.close')}
        footer={
          provider ? (
            <>
              <Button variant="secondary" onClick={() => setProvider(null)}>
                {t('common.previous')}
              </Button>
              <Button type="submit" form="connect-form" loading={create.isPending} disabled={!draft.displayName}>
                {t('banks.connect')}
              </Button>
            </>
          ) : undefined
        }
      >
        {!provider ? (
          providers.isPending ? (
            <Skeleton className="h-40" />
          ) : providers.isError ? (
            <ErrorState title={t('common.somethingWrong')} onRetry={() => void providers.refetch()} retryLabel={t('common.retry')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2" role="list">
              {providers.data.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  onClick={() => {
                    setProvider(p);
                    setDraft((d) => ({ ...d, displayName: d.displayName || p.name }));
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-line p-4 text-left transition hover:border-brand-2 hover:bg-brand-50/50"
                  data-testid={`provider-${p.code}`}
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-brand">
                    <Landmark className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{p.name}</p>
                    {p.isDemo ? (
                      <Badge tone="pending">{t('banks.demoOnly')}</Badge>
                    ) : p.integrationAvailable ? (
                      <Badge tone="success">{t('banks.liveIntegration')}</Badge>
                    ) : (
                      <Badge>{t('banks.comingSoon')}</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )
        ) : (
          <form
            id="connect-form"
            className="space-y-4"
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setFormError(null);
              create.mutate();
            }}
          >
            {!provider.integrationAvailable ? <Alert tone="warning">{t('banks.pendingIntegration')}</Alert> : null}
            <Field label={t('banks.displayName')} hint={t('banks.displayNameHint')}>
              {(p) => <Input {...p} value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('common.currency')}>
                {(p) => (
                  <Select {...p} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as 'USD' | 'KHR' })}>
                    <option value="USD">USD ($)</option>
                    <option value="KHR">KHR (៛)</option>
                  </Select>
                )}
              </Field>
              <Field label={t('banks.defaultOutlet')}>
                {(p) => (
                  <Select {...p} value={draft.outletId} onChange={(e) => setDraft({ ...draft, outletId: e.target.value })}>
                    <option value="">{t('banks.noOutlet')}</option>
                    {(outlets.data ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            {provider.code === 'BAKONG_KHQR' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('banks.bakongAccount')} hint={t('banks.bakongAccountHint')}>
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="off"
                      placeholder="shop@aclb"
                      value={draft.externalAccountId}
                      onChange={(e) => setDraft({ ...draft, externalAccountId: e.target.value.trim().toLowerCase() })}
                      data-testid="bakong-account"
                    />
                  )}
                </Field>
                <Field label={t('banks.qrName')} hint={t('banks.qrNameHint')}>
                  {(p) => <Input {...p} maxLength={25} value={draft.accountName} onChange={(e) => setDraft({ ...draft, accountName: e.target.value })} data-testid="qr-name" />}
                </Field>
              </div>
            ) : !provider.isDemo ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`${t('banks.accountName')} (${t('common.optional')})`}>
                  {(p) => <Input {...p} value={draft.accountName} onChange={(e) => setDraft({ ...draft, accountName: e.target.value })} />}
                </Field>
                <Field label={`${t('banks.accountNumber')} (${t('common.optional')})`} hint={t('banks.accountNumberHint')}>
                  {(p) => <Input {...p} inputMode="numeric" value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} />}
                </Field>
              </div>
            ) : null}
            {formError ? <Alert tone="error">{formError}</Alert> : null}
          </form>
        )}
      </Modal>

      {/* Webhook credentials: shown once after create/rotate */}
      <Modal
        open={!!secret}
        onClose={() => setSecret(null)}
        title={t('banks.secretTitle')}
        closeLabel={t('common.close')}
        footer={<Button onClick={() => setSecret(null)}>{t('banks.secretSaved')}</Button>}
      >
        {secret ? (
          <div className="space-y-4">
            <Alert tone="warning">{t('banks.secretWarning')}</Alert>
            {secret.webhookUrl ? <CopyField label={t('banks.webhookUrl')} value={secret.webhookUrl} /> : null}
            {secret.webhookSecret ? <CopyField label={t('banks.webhookSecret')} value={secret.webhookSecret} /> : null}
          </div>
        ) : null}
      </Modal>

      {/* Confirmations */}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm?.kind === 'rotate' ? t('banks.rotate') : t('banks.disconnect')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant={confirm?.kind === 'disconnect' ? 'danger' : 'primary'} loading={act.isPending} onClick={() => confirm && act.mutate(confirm)}>
              {confirm?.kind === 'rotate' ? t('banks.rotate') : t('banks.disconnect')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">{confirm?.kind === 'rotate' ? t('banks.rotateConfirm') : t('banks.disconnectConfirm')}</p>
      </Modal>

      {/* Demo simulator */}
      <Modal
        open={!!simulating}
        onClose={() => setSimulating(null)}
        title={t('banks.simulateTitle')}
        description={simulating?.displayName}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSimulating(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="simulate-form" loading={simulate.isPending} disabled={!/^\d{1,9}(\.\d{1,2})?$/.test(sim.amount)}>
              {t('banks.simulate')}
            </Button>
          </>
        }
      >
        <form
          id="simulate-form"
          className="space-y-4"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            simulate.mutate();
          }}
        >
          <Alert tone="warning">{t('banks.simulateHint')}</Alert>
          <Field label={`${t('common.amount')} (${simulating?.currency ?? ''})`}>
            {(p) => <Input {...p} inputMode="decimal" value={sim.amount} onChange={(e) => setSim({ ...sim, amount: e.target.value })} />}
          </Field>
          <Field label={`${t('banks.payerName')} (${t('common.optional')})`}>
            {(p) => <Input {...p} value={sim.payerName} onChange={(e) => setSim({ ...sim, payerName: e.target.value })} />}
          </Field>
        </form>
      </Modal>
    </>
  );
}

export default function BankConnectionsPage() {
  return (
    <Suspense>
      <BankConnectionsInner />
    </Suspense>
  );
}

/** Phones forwarding bank app alerts into this connection; set up from the Android app. */
function RelayPhones({ connectionId, canManage }: { connectionId: string; canManage: boolean }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const phones = useQuery({
    queryKey: ['relay-phones', connectionId],
    queryFn: () => api.get<RelayPhoneDto[]>('relay/phones', { bankConnectionId: connectionId }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`relay/phones/${id}`),
    onSuccess: async () => {
      show({ tone: 'success', title: t('banks.phoneRemoved') });
      await qc.invalidateQueries({ queryKey: ['relay-phones', connectionId] });
    },
    onError: toastError,
  });
  return (
    <div className="mt-4 rounded-xl border border-line p-3" data-testid="relay-phones">
      <p className="text-sm font-medium text-ink">{t('banks.phonesTitle')}</p>
      {phones.isPending ? (
        <Skeleton className="mt-2 h-8" />
      ) : phones.isError ? (
        <p className="mt-1 text-sm text-failed">{errorText(phones.error, t)}</p>
      ) : phones.data.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2">{t('banks.phonesEmpty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {phones.data.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
              <Smartphone className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{p.name}</span>
                <span className="block text-xs text-ink-3">
                  {t('banks.phoneLastSeen')}: {p.lastSeenAt ? dateTime(p.lastSeenAt, locale) : t('banks.never')}
                </span>
              </span>
              {canManage ? (
                <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === p.id} onClick={() => remove.mutate(p.id)}>
                  {t('banks.removePhone')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-ink-3">{t('banks.phonesHint')}</p>
    </div>
  );
}

