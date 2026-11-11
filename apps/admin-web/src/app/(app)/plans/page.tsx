'use client';

import { Permission, fromMinorUnits, type Currency, type PlanDto } from '@onepay/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Table, TableSkeleton, Td, Th, useToast } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { money } from '@onepay/web-core/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ReceiptText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/common';
import { errorText, keys, useCan } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { parsePrice } from '@/lib/money';

type Draft = {
  code: string;
  name: string;
  price: string;
  currency: Currency;
  interval: 'MONTH' | 'YEAR';
  maxOutlets: string;
  maxEmployees: string;
  maxBankConns: string;
  maxDevices: string;
};
const LIMITS = ['maxOutlets', 'maxEmployees', 'maxBankConns', 'maxDevices'] as const;
const emptyDraft: Draft = { code: '', name: '', price: '', currency: 'USD', interval: 'MONTH', maxOutlets: '1', maxEmployees: '3', maxBankConns: '2', maxDevices: '1' };

export default function PlansPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const canManage = can(Permission.PLATFORM_PLANS_MANAGE);
  const qc = useQueryClient();
  const { show } = useToast();
  const [editing, setEditing] = useState<PlanDto | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  const plans = useQuery({ queryKey: keys.plans, queryFn: () => api.get<PlanDto[]>('platform/plans') });
  const priceMinor = parsePrice(draft.price, draft.currency);
  const limitsOk = LIMITS.every((k) => /^\d{1,6}$/.test(draft[k]));

  const save = useMutation({
    mutationFn: () => {
      const limits = Object.fromEntries(LIMITS.map((k) => [k, Number(draft[k])]));
      return editing === 'new'
        ? api.post<PlanDto>('platform/plans', { code: draft.code, name: draft.name, priceMinor, currency: draft.currency, interval: draft.interval, ...limits })
        : api.patch<PlanDto>(`platform/plans/${(editing as PlanDto).id}`, { name: draft.name, priceMinor, ...limits });
    },
    onSuccess: () => {
      show({ tone: 'success', title: editing === 'new' ? t('plans.created') : t('plans.updated') });
      setEditing(null);
      void qc.invalidateQueries({ queryKey: keys.plans });
    },
    onError: (e) => setError(errorText(e, t)),
  });

  const toggle = useMutation({
    mutationFn: (p: PlanDto) => api.patch(`platform/plans/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => {
      show({ tone: 'success', title: t('plans.updated') });
      void qc.invalidateQueries({ queryKey: keys.plans });
    },
    onError: (e) => show({ tone: 'error', title: t('common.somethingWrong'), description: errorText(e, t) }),
  });

  function open(target: PlanDto | 'new') {
    setError(null);
    setDraft(
      target === 'new'
        ? emptyDraft
        : {
            code: target.code,
            name: target.name,
            price: fromMinorUnits(target.priceMinor, target.currency),
            currency: target.currency,
            interval: target.interval,
            maxOutlets: String(target.maxOutlets),
            maxEmployees: String(target.maxEmployees),
            maxBankConns: String(target.maxBankConns),
            maxDevices: String(target.maxDevices),
          },
    );
    setEditing(target);
  }

  return (
    <>
      <PageHeader
        title={t('plans.title')}
        subtitle={t('plans.subtitle')}
        actions={canManage ? <Button icon={<Plus className="size-4" />} onClick={() => open('new')}>{t('plans.add')}</Button> : null}
      />
      <Card>
        {plans.isPending ? (
          <TableSkeleton cols={6} />
        ) : plans.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(plans.error, t)} onRetry={() => void plans.refetch()} retryLabel={t('common.retry')} />
        ) : plans.data.length === 0 ? (
          <EmptyState icon={<ReceiptText className="size-6" />} title={t('plans.title')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('plans.price')}</Th>
                <Th>{t('plans.limits')}</Th>
                <Th className="text-right">{t('plans.subscribers')}</Th>
                <Th>{t('common.status')}</Th>
                {canManage ? <Th className="text-right">{t('common.actions')}</Th> : null}
              </tr>
            </thead>
            <tbody data-testid="plans-table">
              {plans.data.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <p className="font-medium">{p.name}</p>
                    <code className="text-xs text-ink-3">{p.code}</code>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {money(p.priceMinor, p.currency, locale)} <span className="text-ink-3">{t(p.interval === 'MONTH' ? 'plans.perMONTH' : 'plans.perYEAR')}</span>
                  </Td>
                  <Td className="text-xs text-ink-2">
                    {t('plans.maxOutlets')} {p.maxOutlets} · {t('plans.maxEmployees')} {p.maxEmployees} · {t('plans.maxBankConns')} {p.maxBankConns} ·{' '}
                    {t('plans.maxDevices')} {p.maxDevices}
                  </Td>
                  <Td className="text-right tabular-nums">{p.subscriberCount}</Td>
                  <Td>{p.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</Td>
                  {canManage ? (
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => open(p)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="ghost" size="sm" loading={toggle.isPending && toggle.variables?.id === p.id} onClick={() => toggle.mutate(p)}>
                        {p.isActive ? t('plans.deactivate') : t('plans.activate')}
                      </Button>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('plans.addTitle') : t('plans.editTitle')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="plan-form" loading={save.isPending} disabled={!draft.name || !draft.code || priceMinor === null || !limitsOk}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="plan-form"
          className="space-y-4"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('plans.code')} hint={t('plans.codeHint')}>
              {(p) => (
                <Input {...p} value={draft.code} disabled={editing !== 'new'} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
              )}
            </Field>
            <Field label={t('common.name')}>{(p) => <Input {...p} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('plans.price')} hint={t('plans.priceHint')} error={draft.price && priceMinor === null ? t('plans.invalidPrice') : null}>
              {(p) => <Input {...p} inputMode="decimal" placeholder="29.00" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />}
            </Field>
            <Field label={t('common.currency')}>
              {(p) => (
                <Select {...p} disabled={editing !== 'new'} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as Currency })}>
                  <option value="USD">USD</option>
                  <option value="KHR">KHR</option>
                </Select>
              )}
            </Field>
            <Field label={t('plans.interval')}>
              {(p) => (
                <Select {...p} disabled={editing !== 'new'} value={draft.interval} onChange={(e) => setDraft({ ...draft, interval: e.target.value as 'MONTH' | 'YEAR' })}>
                  <option value="MONTH">{t('plans.MONTH')}</option>
                  <option value="YEAR">{t('plans.YEAR')}</option>
                </Select>
              )}
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">{t('plans.limits')}</legend>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {LIMITS.map((k) => (
                <Field key={k} label={t(`plans.${k}`)}>
                  {(p) => <Input {...p} inputMode="numeric" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/\D/g, '') })} />}
                </Field>
              ))}
            </div>
          </fieldset>
          {error ? <Alert tone="error">{error}</Alert> : null}
        </form>
      </Modal>
    </>
  );
}
