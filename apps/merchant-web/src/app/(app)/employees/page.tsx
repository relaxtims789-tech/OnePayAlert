'use client';

import { ASSIGNABLE_ROLES, Permission, type CompanyRole, type EmployeeDto, type Paginated } from '@onepay/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Table, TableSkeleton, Td, Th, useToast } from '@onepay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, UserPlus, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { errorText, queryKeys, useCan, useMe, useOutletOptions } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

type Draft = {
  email: string;
  fullName: string;
  phone: string;
  role: CompanyRole;
  initialPassword: string;
  outletIds: string[];
  isActive: boolean;
};

export default function EmployeesPage() {
  const { t } = useI18n();
  const can = useCan();
  const me = useMe();
  const qc = useQueryClient();
  const { show } = useToast();
  const canManage = can(Permission.EMPLOYEE_MANAGE);
  const myRole = me.data?.activeRole ?? null;
  const assignable = myRole ? ASSIGNABLE_ROLES[myRole] : [];
  const [editing, setEditing] = useState<EmployeeDto | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: queryKeys.employees({ page: 1 }),
    queryFn: () => api.get<Paginated<EmployeeDto>>('employees', { pageSize: 100 }),
  });
  const outlets = useOutletOptions(can(Permission.OUTLET_READ));
  const outletName = (id: string) => outlets.data?.find((o) => o.id === id)?.name ?? '…';

  const save = useMutation({
    mutationFn: (d: Draft) =>
      editing === 'new'
        ? api.post<EmployeeDto>('employees', {
            email: d.email,
            fullName: d.fullName,
            phone: d.phone || undefined,
            role: d.role,
            initialPassword: d.initialPassword,
            outletIds: d.outletIds,
          })
        : api.patch<EmployeeDto>(`employees/${(editing as EmployeeDto).membershipId}`, {
            role: d.role,
            outletIds: d.outletIds,
            isActive: d.isActive,
          }),
    onSuccess: () => {
      show({ tone: 'success', title: editing === 'new' ? t('employees.added') : t('employees.updated') });
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (e) => setFormError(errorText(e, t)),
  });

  function open(target: EmployeeDto | 'new') {
    setFormError(null);
    setDraft(
      target === 'new'
        ? { email: '', fullName: '', phone: '', role: assignable[assignable.length - 1] ?? 'CASHIER', initialPassword: '', outletIds: [], isActive: true }
        : { email: target.email, fullName: target.fullName, phone: target.phone ?? '', role: target.role, initialPassword: '', outletIds: target.outletIds, isActive: target.isActive },
    );
    setEditing(target);
  }

  const canEdit = (e: EmployeeDto) => canManage && e.userId !== me.data?.id && assignable.includes(e.role);
  const isNew = editing === 'new';

  return (
    <>
      <PageHeader
        title={t('employees.title')}
        subtitle={t('employees.subtitle')}
        actions={canManage && assignable.length > 0 ? <Button icon={<UserPlus className="size-4" />} onClick={() => open('new')}>{t('employees.add')}</Button> : null}
      />
      <Card>
        {list.isPending ? (
          <TableSkeleton cols={5} />
        ) : list.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(list.error, t)} onRetry={() => void list.refetch()} retryLabel={t('common.retry')} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title={t('employees.empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('common.role')}</Th>
                <Th>{t('employees.outletAccess')}</Th>
                <Th>{t('common.status')}</Th>
                {canManage ? <Th className="text-right">{t('common.actions')}</Th> : null}
              </tr>
            </thead>
            <tbody data-testid="employees-table">
              {list.data.items.map((e) => (
                <tr key={e.membershipId}>
                  <Td>
                    <p className="font-medium">
                      {e.fullName} {e.userId === me.data?.id ? <Badge tone="brand">{t('employees.you')}</Badge> : null}
                    </p>
                    <p className="text-xs text-ink-3">{e.email}</p>
                  </Td>
                  <Td>{t(`roles.${e.role}`)}</Td>
                  <Td className="text-ink-2">
                    {e.outletIds.length === 0
                      ? t('employees.allOutlets')
                      : e.outletIds.length <= 2
                        ? e.outletIds.map(outletName).join(', ')
                        : t('employees.restrictedTo', { count: e.outletIds.length })}
                  </Td>
                  <Td>{e.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</Td>
                  {canManage ? (
                    <Td className="text-right">
                      {canEdit(e) ? (
                        <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => open(e)}>
                          {t('common.edit')}
                        </Button>
                      ) : null}
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={editing !== null && draft !== null}
        onClose={() => setEditing(null)}
        title={isNew ? t('employees.addTitle') : t('employees.editTitle')}
        description={!isNew && draft ? `${draft.fullName} · ${draft.email}` : undefined}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="employee-form"
              loading={save.isPending}
              disabled={!draft || (isNew && (!draft.email || !draft.fullName || !draft.initialPassword))}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        {draft ? (
          <form
            id="employee-form"
            className="space-y-4"
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setFormError(null);
              save.mutate(draft);
            }}
          >
            {isNew ? (
              <>
                <Field label={t('common.name')}>{(p) => <Input {...p} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />}</Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('common.email')}>
                    {(p) => <Input {...p} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />}
                  </Field>
                  <Field label={`${t('common.phone')} (${t('common.optional')})`}>
                    {(p) => <Input {...p} type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />}
                  </Field>
                </div>
              </>
            ) : null}
            <Field label={t('common.role')}>
              {(p) => (
                <Select {...p} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as CompanyRole })}>
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {isNew ? (
              <Field label={t('employees.initialPassword')} hint={`${t('employees.initialPasswordHint')} ${t('auth.passwordHint')}`}>
                {(p) => (
                  <Input {...p} type="password" autoComplete="new-password" value={draft.initialPassword} onChange={(e) => setDraft({ ...draft, initialPassword: e.target.value })} />
                )}
              </Field>
            ) : null}
            {outlets.data && outlets.data.length > 0 ? (
              <fieldset>
                <legend className="text-sm font-medium text-ink">{t('employees.outletAccess')}</legend>
                <p className="mb-2 text-xs text-ink-3">{t('employees.allOutletsHint')}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {outlets.data.map((o) => (
                    <label key={o.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface">
                      <input
                        type="checkbox"
                        className="size-4 accent-[#0759B8]"
                        checked={draft.outletIds.includes(o.id)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            outletIds: e.target.checked ? [...draft.outletIds, o.id] : draft.outletIds.filter((x) => x !== o.id),
                          })
                        }
                      />
                      {o.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {!isNew ? (
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" className="size-4 accent-[#0759B8]" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
                {t('common.active')}
              </label>
            ) : null}
            {formError ? <Alert tone="error">{formError}</Alert> : null}
          </form>
        ) : null}
      </Modal>
    </>
  );
}
