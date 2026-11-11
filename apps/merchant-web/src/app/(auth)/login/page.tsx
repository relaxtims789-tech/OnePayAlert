'use client';

import { Alert, Button, Field, Input } from '@onepay/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { session } from '@/lib/api';
import { errorText } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const notice = params.get('expired') ? t('auth.sessionExpired') : params.get('reset') ? t('auth.resetDone') : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await session.login({ email, password });
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(errorText(err, t));
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('auth.signInTitle')}</h1>
      <p className="mt-1.5 text-ink-2">{t('auth.signInSubtitle')}</p>
      {notice ? (
        <Alert tone="info" className="mt-6">
          {notice}
        </Alert>
      ) : null}
      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <Field label={t('common.email')}>
          {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t('auth.password')}>
          {(p) => (
            <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email || !password}>
          {t('auth.signIn')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-ink-2">
        {t('auth.noAccount')}{' '}
        <Link href="/register" className="font-medium text-brand hover:underline">
          {t('auth.createAccount')}
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
