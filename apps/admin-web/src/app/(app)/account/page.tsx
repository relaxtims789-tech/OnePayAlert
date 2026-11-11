'use client';

import { Alert, Button, Card, CardHeader, Field, Input, useToast } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { KeyValue, PageHeader } from '@/components/common';
import { errorText, useMe } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

export default function AccountPage() {
  const { t } = useI18n();
  const me = useMe();
  const { show } = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;

  const save = useMutation({
    mutationFn: () => api.post('auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      show({ tone: 'success', title: t('account.changed') });
    },
    onError: (e) => setError(errorText(e, t)),
  });

  return (
    <>
      <PageHeader title={t('account.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <dl className="divide-y divide-line">
            <KeyValue k={t('common.name')} v={me.data?.fullName} />
            <KeyValue k={t('common.email')} v={me.data?.email} />
            <KeyValue k={t('account.role')} v={me.data?.platformRole ? t(`account.${me.data.platformRole}`) : '—'} />
          </dl>
        </Card>
        <Card>
          <CardHeader title={t('account.password')} subtitle={t('account.passwordHint')} />
          <form
            className="grid gap-4 p-5"
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (mismatch) return;
              setError(null);
              save.mutate();
            }}
          >
            <Field label={t('account.currentPassword')}>
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />}
            </Field>
            <Field label={t('account.newPassword')}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />}
            </Field>
            <Field label={t('account.confirmPassword')} error={mismatch ? t('account.mismatch') : null}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
            </Field>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div>
              <Button type="submit" loading={save.isPending} disabled={!form.currentPassword || !form.newPassword || mismatch}>
                {t('account.password')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
