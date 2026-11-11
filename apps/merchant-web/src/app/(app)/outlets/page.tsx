'use client';

import { Permission, type OutletDto, type Paginated } from '@onepay/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Table, TableSkeleton, Td, Th, useToast } from '@onepay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Store } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { errorText, queryKeys, useCan, useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

type Draft = { name: string; code: string; address: string; phone: string };
const empty: Draft = { name: '', code: '', address: '', phone: '' };

export default function OutletsPage() {
  const { t } = useI18n();
  const can = useCan();
  const canManage = can(Permission.OUTLET_MANAGE);
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const [editing, setEditing] = useState<OutletDto | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: queryKeys.outlets({ page: 1 }),
    queryFn: () => api.get<Paginated<OutletDto>>('outlets', { pageSize: 100 }),
  });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = { name: d.name, code: d.code, address: d.address || undefined, phone: d.phone || undefined };
      return editing === 'new' ? api.post<OutletDto>('outlets', body) : api.patch<OutletDto>(`outlets/${(editing as OutletDto).id}`, body);
    },
    onSuccess: () => {
      show({ tone: 'success', title: editing === 'new' ? t('outlets.created') : t('outlets.updated') });
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['outlets'] });
    },
    onError: (e) => setFormError(errorText(e, t)),
  });

  const toggle = useMutation({
    mutationFn: (o: OutletDto) => api.patch<OutletDto>(`outlets/${o.id}`, { isActive: !o.isActive }),
    onSuccess: () => {
      show({ tone: 'success', title: t('outlets.updated') });
      void qc.invalidateQueries({ queryKey: ['outlets'] });
    },
    onError: toastError,
  });

  function open(target: OutletDto | 'new') {
    setFormError(null);
    setDraft(target === 'new' ? empty : { name: target.name, code: target.code, address: target.address ?? '', phone: target.phone ?? '' });
    setEditing(target);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    save.mutate(draft);
  }

  return (
    <>
      <PageHeader
        title={t('outlets.title')}
        subtitle={t('outlets.subtitle')}
        actions={canManage ? <Button icon={<Plus className="size-4" />} onClick={() => open('new')}>{t('outlets.add')}</Button> : null}
      />
      <Card>
        {list.isPending ? (
          <TableSkeleton cols={5} />
        ) : list.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(list.error, t)} onRetry={() => void list.refetch()} retryLabel={t('common.retry')} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<Store className="size-6" />} title={t('outlets.empty')} description={t('outlets.emptyHint')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('outlets.code')}</Th>
                <Th>{t('outlets.address')}</Th>
                <Th>{t('common.status')}</Th>
                {canManage ? <Th className="text-right">{t('common.actions')}</Th> : null}
              </tr>
            </thead>
            <tbody data-testid="outlets-table">
              {list.data.items.map((o) => (
                <tr key={o.id}>
                  <Td className="font-medium">{o.name}</Td>
                  <Td>
                    <code className="rounded-md bg-surface px-1.5 py-0.5 text-xs">{o.code}</code>
                  </Td>
                  <Td className="max-w-xs truncate text-ink-2">{o.address ?? '—'}</Td>
                  <Td>{o.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</Td>
                  {canManage ? (
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => open(o)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="ghost" size="sm" loading={toggle.isPending && toggle.variables?.id === o.id} onClick={() => toggle.mutate(o)}>
                        {o.isActive ? t('outlets.deactivate') : t('outlets.activate')}
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
        title={editing === 'new' ? t('outlets.addTitle') : t('outlets.editTitle')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="outlet-form" loading={save.isPending} disabled={!draft.name || !draft.code}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="outlet-form" onSubmit={submit} className="space-y-4" noValidate>
          <Field label={t('common.name')}>{(p) => <Input {...p} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
          <Field label={t('outlets.code')} hint={t('outlets.codeHint')}>
            {(p) => <Input {...p} value={draft.code} maxLength={32} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />}
          </Field>
          <Field label={`${t('outlets.address')} (${t('common.optional')})`}>
            {(p) => <Input {...p} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />}
          </Field>
          <Field label={`${t('common.phone')} (${t('common.optional')})`}>
            {(p) => <Input {...p} type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />}
          </Field>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
        </form>
      </Modal>
    </>
  );
}
