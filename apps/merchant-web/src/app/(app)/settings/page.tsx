'use client';

import { Permission, SUPPORTED_LOCALES, type CompanyDto, type Locale, type MeResponse, type Paginated } from '@onepay/shared';
import { Alert, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Pagination, Segmented, Select, Skeleton, Table, TableSkeleton, Td, Th, useToast } from '@onepay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { errorText, queryKeys, useCan, useMe } from '@/lib/hooks';
import { LOCALE_LABELS, useI18n } from '@/lib/i18n';

type Tab = 'company' | 'profile' | 'security' | 'audit';

export default function SettingsPage() {
  const { t } = useI18n();
  const can = useCan();
  const [tab, setTab] = useState<Tab>('company');
  const tabs: { value: Tab; label: string }[] = [
    { value: 'company', label: t('settings.company') },
    { value: 'profile', label: t('settings.profile') },
    { value: 'security', label: t('settings.security') },
    ...(can(Permission.AUDIT_READ) ? [{ value: 'audit' as const, label: t('settings.auditLog') }] : []),
  ];
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <Segmented value={tab} onChange={setTab} options={tabs} className="mb-6" ariaLabel={t('settings.title')} />
      {tab === 'company' ? <CompanyTab /> : tab === 'profile' ? <ProfileTab /> : tab === 'security' ? <SecurityTab /> : <AuditTab />}
    </>
  );
}

function CompanyTab() {
  const { t } = useI18n();
  const can = useCan();
  const editable = can(Permission.COMPANY_UPDATE);
  const qc = useQueryClient();
  const { show } = useToast();
  const company = useQuery({ queryKey: queryKeys.company, queryFn: () => api.get<CompanyDto>('companies/current') });
  const [form, setForm] = useState({ name: '', legalName: '', email: '', phone: '', address: '', taxId: '', defaultCurrency: 'USD' as 'USD' | 'KHR' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = company.data;
    if (c) setForm({ name: c.name, legalName: c.legalName ?? '', email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', taxId: c.taxId ?? '', defaultCurrency: c.defaultCurrency });
  }, [company.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')) as Record<string, string>;
      return api.patch<CompanyDto>('companies/current', body);
    },
    onSuccess: (c) => {
      qc.setQueryData(queryKeys.company, c);
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      show({ tone: 'success', title: t('settings.companySaved') });
    },
    onError: (e) => setError(errorText(e, t)),
  });

  if (company.isPending) return <Skeleton className="h-96 rounded-card" />;
  if (company.isError) return <Card><ErrorState title={t('common.somethingWrong')} message={errorText(company.error, t)} onRetry={() => void company.refetch()} retryLabel={t('common.retry')} /></Card>;

  const field = (k: keyof typeof form, label: string, type = 'text') => (
    <Field label={label}>
      {(p) => <Input {...p} type={type} disabled={!editable} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
    </Field>
  );

  return (
    <Card>
      <CardHeader title={t('settings.company')} />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        {!editable ? <Alert tone="info" className="sm:col-span-2">{t('settings.readOnly')}</Alert> : null}
        {field('name', t('auth.companyName'))}
        {field('legalName', `${t('settings.legalName')} (${t('common.optional')})`)}
        {field('email', t('common.email'), 'email')}
        {field('phone', t('common.phone'), 'tel')}
        {field('taxId', `${t('settings.taxId')} (${t('common.optional')})`)}
        <Field label={t('auth.defaultCurrency')}>
          {(p) => (
            <Select {...p} disabled={!editable} value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value as 'USD' | 'KHR' })}>
              <option value="USD">USD ($)</option>
              <option value="KHR">KHR (៛)</option>
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2">{field('address', t('settings.address'))}</div>
        {error ? <Alert tone="error" className="sm:col-span-2">{error}</Alert> : null}
        {editable ? (
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={!form.name}>
              {t('common.saveChanges')}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function ProfileTab() {
  const { t, setLocale } = useI18n();
  const me = useMe();
  const qc = useQueryClient();
  const { show } = useToast();
  const [form, setForm] = useState({ fullName: '', phone: '', locale: 'km' as Locale });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me.data) setForm({ fullName: me.data.fullName, phone: me.data.phone ?? '', locale: me.data.locale });
  }, [me.data]);

  const save = useMutation({
    mutationFn: () => api.patch<MeResponse>('auth/me', { fullName: form.fullName, phone: form.phone || undefined, locale: form.locale }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.me, data);
      setLocale(data.locale);
      show({ tone: 'success', title: t('settings.profileSaved') });
    },
    onError: (e) => setError(errorText(e, t)),
  });

  if (!me.data) return <Skeleton className="h-72 rounded-card" />;
  return (
    <Card>
      <CardHeader title={t('settings.profile')} subtitle={me.data.email} />
      <form
        className="grid max-w-2xl gap-4 p-5 sm:grid-cols-2"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <Field label={t('common.name')}>{(p) => <Input {...p} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />}</Field>
        <Field label={t('common.phone')}>{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
        <Field label={t('common.language')}>
          {(p) => (
            <Select {...p} value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as Locale })}>
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error ? <Alert tone="error" className="sm:col-span-2">{error}</Alert> : null}
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!form.fullName}>
            {t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SecurityTab() {
  const { t } = useI18n();
  const { show } = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;

  const save = useMutation({
    mutationFn: () => api.post('auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      show({ tone: 'success', title: t('settings.passwordChanged') });
    },
    onError: (e) => setError(errorText(e, t)),
  });

  return (
    <Card>
      <CardHeader title={t('settings.changePassword')} subtitle={t('auth.passwordHint')} />
      <form
        className="grid max-w-md gap-4 p-5"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (mismatch) return;
          setError(null);
          save.mutate();
        }}
      >
        <Field label={t('settings.currentPassword')}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />}
        </Field>
        <Field label={t('auth.newPassword')}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />}
        </Field>
        <Field label={t('auth.confirmPassword')} error={mismatch ? t('auth.passwordsMismatch') : null}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div>
          <Button type="submit" loading={save.isPending} disabled={!form.currentPassword || !form.newPassword || mismatch}>
            {t('settings.changePassword')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  ipAddress: string | null;
}

function AuditTab() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const PAGE = 20;
  const logs = useQuery({
    queryKey: queryKeys.audit(page),
    queryFn: () => api.get<Paginated<AuditItem>>('companies/current/audit-logs', { page, pageSize: PAGE }),
  });
  return (
    <Card>
      <CardHeader title={t('settings.auditLog')} />
      <div className="mt-3">
        {logs.isPending ? (
          <TableSkeleton cols={3} />
        ) : logs.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(logs.error, t)} onRetry={() => void logs.refetch()} retryLabel={t('common.retry')} />
        ) : logs.data.items.length === 0 ? (
          <EmptyState icon={<History className="size-6" />} title={t('settings.auditEmpty')} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t('settings.when')}</Th>
                  <Th>{t('settings.action')}</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {logs.data.items.map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap text-ink-2">{dateTime(l.createdAt, locale)}</Td>
                    <Td>
                      <code className="text-xs">{l.action}</code>
                    </Td>
                    <Td className="text-ink-3">{l.ipAddress ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE}
              total={logs.data.total}
              onPage={setPage}
              labels={{
                previous: t('common.previous'),
                next: t('common.next'),
                summary: t('common.pageSummary', { from: (page - 1) * PAGE + 1, to: Math.min(page * PAGE, logs.data.total), total: logs.data.total }),
              }}
            />
          </>
        )}
      </div>
    </Card>
  );
}
