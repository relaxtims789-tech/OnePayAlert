'use client';

import { Alert, Button, Field, Input } from '@onepay/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorText } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('auth.forgotTitle')}</h1>
      <p className="mt-1.5 text-ink-2">{t('auth.forgotSubtitle')}</p>
      {sent ? (
        <Alert tone="success" className="mt-8">
          {t('auth.linkSent')}
        </Alert>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          <Field label={t('common.email')}>
            {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email}>
            {t('auth.sendLink')}
          </Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="font-medium text-brand hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </>
  );
}
