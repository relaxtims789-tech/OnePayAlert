'use client';

import { SUPPORTED_LOCALES, type Locale } from '@onepay/shared';
import { Alert, Button, Field, Input, Select } from '@onepay/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { session } from '@/lib/api';
import { errorText } from '@/lib/hooks';
import { LOCALE_LABELS, useI18n } from '@/lib/i18n';

export default function RegisterPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    password: '',
    defaultCurrency: 'USD' as 'USD' | 'KHR',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await session.register({ ...form, phone: form.phone.trim() || undefined, locale });
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(errorText(err, t));
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('auth.registerTitle')}</h1>
      <p className="mt-1.5 text-ink-2">{t('auth.registerSubtitle')}</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label={t('auth.companyName')}>
          {(p) => <Input {...p} required autoComplete="organization" value={form.companyName} onChange={set('companyName')} />}
        </Field>
        <Field label={t('auth.fullName')}>
          {(p) => <Input {...p} required autoComplete="name" value={form.fullName} onChange={set('fullName')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.email')}>
            {(p) => <Input {...p} type="email" required autoComplete="email" value={form.email} onChange={set('email')} />}
          </Field>
          <Field label={`${t('common.phone')} (${t('common.optional')})`}>
            {(p) => <Input {...p} type="tel" autoComplete="tel" placeholder="+855…" value={form.phone} onChange={set('phone')} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.defaultCurrency')}>
            {(p) => (
              <Select {...p} value={form.defaultCurrency} onChange={set('defaultCurrency')}>
                <option value="USD">USD ($)</option>
                <option value="KHR">KHR (៛)</option>
              </Select>
            )}
          </Field>
          <Field label={t('auth.preferredLanguage')}>
            {(p) => (
              <Select {...p} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                {SUPPORTED_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_LABELS[l]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
          {(p) => <Input {...p} type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={loading}
          disabled={!form.fullName || !form.companyName || !form.email || !form.password}
        >
          {t('auth.createAccount')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-ink-2">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="font-medium text-brand hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </>
  );
}
