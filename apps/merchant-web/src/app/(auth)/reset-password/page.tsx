'use client';

import { Alert, Button, Field, Input } from '@onepay/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorText } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

function ResetForm() {
  const { t } = useI18n();
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mismatch || !token) return;
    setError(null);
    setLoading(true);
    try {
      await api.post('auth/reset-password', { token, newPassword: password });
      router.replace('/login?reset=1');
    } catch (err) {
      setError(errorText(err, t));
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('auth.resetTitle')}</h1>
      <p className="mt-1.5 text-ink-2">{t('auth.resetSubtitle')}</p>
      {!token ? (
        <Alert tone="error" className="mt-8">
          {t('auth.resetMissingToken')}
        </Alert>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Field label={t('auth.confirmPassword')} error={mismatch ? t('auth.passwordsMismatch') : null}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!password || !confirm || mismatch}>
            {t('auth.resetTitle')}
          </Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm">
        <Link href={token ? '/login' : '/forgot-password'} className="font-medium text-brand hover:underline">
          {token ? t('auth.backToSignIn') : t('auth.sendLink')}
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
