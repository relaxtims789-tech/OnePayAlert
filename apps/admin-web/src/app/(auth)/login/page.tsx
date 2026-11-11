'use client';

import { Alert, Button, Field, Input, LogoMark } from '@onepay/ui';
import { ApiError, session } from '@onepay/web-core/client';
import { ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { LanguageSwitcher } from '@/components/common';
import { errorText } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const expired = useSearchParams().get('expired');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await session.login({ email, password });
      router.replace('/overview');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'NOT_PLATFORM_STAFF' ? t('auth.notStaff') : errorText(err, t));
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 py-10">
      <div className="absolute top-5 right-5">
        <LanguageSwitcher dark />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3 text-white">
          <LogoMark className="size-11" />
          <div>
            <p className="text-lg font-bold tracking-tight">One PayAlert</p>
            <p className="flex items-center gap-1 text-xs text-white/60">
              <ShieldCheck className="size-3.5" aria-hidden /> {t('common.console')}
            </p>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-7 shadow-pop">
          <h1 className="text-xl font-semibold text-ink">{t('auth.title')}</h1>
          <p className="mt-1 text-sm text-ink-2">{t('auth.subtitle')}</p>
          {expired ? (
            <Alert tone="info" className="mt-5">
              {t('auth.sessionExpired')}
            </Alert>
          ) : null}
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label={t('common.email')}>
              {(p) => <Input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Field label={t('auth.password')}>
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email || !password}>
              {t('auth.signIn')}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-white/40">© CAM Professional Technology</p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
