'use client';

import { Permission, type BillingOverviewDto, type Locale } from '@onepay/shared';
import { Badge, Button, ErrorState, Logo, Spinner, cn } from '@onepay/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  ChevronDown,
  CreditCard,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Settings,
  Speaker,
  Store,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { api, session, setSessionExpiredHandler } from '@/lib/api';
import { errorText, useCan, useErrorToast, useMe } from '@/lib/hooks';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { RealtimeProvider } from '@/lib/realtime';

const NAV: { href: string; label: MessageKey; icon: typeof LayoutDashboard; perm?: Permission }[] = [
  { href: '/dashboard', label: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/collect', label: 'nav.collect', icon: QrCode, perm: Permission.PAYMENT_COLLECT },
  { href: '/transactions', label: 'nav.transactions', icon: ArrowLeftRight, perm: Permission.TRANSACTION_READ },
  { href: '/bank-connections', label: 'nav.bankConnections', icon: Landmark, perm: Permission.BANK_CONNECTION_READ },
  { href: '/outlets', label: 'nav.outlets', icon: Store, perm: Permission.OUTLET_READ },
  { href: '/employees', label: 'nav.employees', icon: Users, perm: Permission.EMPLOYEE_READ },
  { href: '/devices', label: 'nav.devices', icon: Speaker, perm: Permission.DEVICE_READ },
  { href: '/reports', label: 'nav.reports', icon: BarChart3, perm: Permission.REPORT_READ },
  { href: '/billing', label: 'nav.billing', icon: CreditCard, perm: Permission.SUBSCRIPTION_READ },
  { href: '/settings', label: 'nav.settings', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useMe();
  const can = useCan();
  const toastError = useErrorToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const billing = useQuery({
    queryKey: ['billing'],
    queryFn: () => api.get<BillingOverviewDto>('billing'),
    enabled: can(Permission.SUBSCRIPTION_READ),
    staleTime: 5 * 60_000,
  });
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      qc.clear();
      window.location.assign('/login?expired=1');
    });
  }, [qc]);

  // The profile language is the source of truth for signed-in users (it also drives push text).
  const profileLocale = me.data?.locale;
  useEffect(() => {
    if (profileLocale && profileLocale !== locale) setLocale(profileLocale);
    // Only react to profile changes; manual switches are saved to the profile first.
  }, [profileLocale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setMobileOpen(false), [pathname]);

  async function changeLanguage(l: Locale) {
    try {
      await api.patch('auth/me', { locale: l });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      toastError(e);
    }
  }

  async function switchCompany(companyId: string) {
    setSwitching(true);
    try {
      await session.switchCompany(companyId);
      qc.clear();
      router.replace('/dashboard');
      router.refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setSwitching(false);
    }
  }

  async function signOut() {
    await session.logout().catch(() => null);
    qc.clear();
    window.location.assign('/login');
  }

  if (me.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <ErrorState title={t('common.somethingWrong')} message={errorText(me.error, t)} onRetry={() => void me.refetch()} retryLabel={t('common.retry')} />
      </div>
    );
  }

  const user = me.data;
  const activeCompany = user.memberships.find((m) => m.companyId === user.activeCompanyId);
  const nav = NAV.filter((n) => !n.perm || can(n.perm));

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4" aria-label="Main">
      <div className="mb-6 flex items-center justify-between px-2 pt-1">
        <Logo />
        <button type="button" className="rounded-lg p-1.5 text-ink-3 lg:hidden" onClick={() => setMobileOpen(false)} aria-label={t('common.close')}>
          <X className="size-5" />
        </button>
      </div>
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'bg-brand text-white shadow-sm' : 'text-ink-2 hover:bg-surface hover:text-ink',
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
            {t(item.label)}
          </Link>
        );
      })}
      <div className="mt-auto rounded-2xl bg-brand-50 p-4 text-xs text-brand">
        <p className="font-semibold">One PayAlert</p>
        <p className="mt-1 text-brand/80">{t('common.tagline')}</p>
      </div>
    </nav>
  );

  return (
    <RealtimeProvider companyId={user.activeCompanyId}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="sticky top-0 hidden h-dvh border-r border-line bg-white lg:block">{sidebar}</aside>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden />
            <aside className="relative h-full w-72 max-w-[85%] bg-white shadow-pop">{sidebar}</aside>
          </div>
        ) : null}

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
            <button type="button" className="rounded-lg p-2 text-ink-2 hover:bg-surface lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t('common.menu')}>
              <Menu className="size-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <Building2 className="size-4 shrink-0 text-ink-3" aria-hidden />
              {user.memberships.length > 1 ? (
                <label className="relative min-w-0">
                  <span className="sr-only">{t('common.switchCompany')}</span>
                  <select
                    className="max-w-[45vw] appearance-none truncate bg-transparent pr-6 text-sm font-semibold text-ink focus:outline-none sm:max-w-xs"
                    value={user.activeCompanyId ?? ''}
                    disabled={switching}
                    onChange={(e) => void switchCompany(e.target.value)}
                    data-testid="company-switcher"
                  >
                    {user.memberships.map((m) => (
                      <option key={m.companyId} value={m.companyId}>
                        {m.companyName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-0 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                </label>
              ) : (
                <span className="truncate text-sm font-semibold text-ink">{activeCompany?.companyName}</span>
              )}
              {user.activeRole ? <Badge tone="brand">{t(`roles.${user.activeRole}`)}</Badge> : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {/* Wrapper controls visibility; the switcher's own inline-flex would override `hidden`. */}
              <div className="hidden sm:block">
                <LanguageSwitcher onChange={(l) => void changeLanguage(l)} />
              </div>
              <div className="hidden text-right md:block">
                <p className="text-sm font-medium text-ink">{user.fullName}</p>
                <p className="text-xs text-ink-3">{user.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void signOut()} icon={<LogOut className="size-4" />} data-testid="sign-out">
                <span className="hidden sm:inline">{t('common.signOut')}</span>
              </Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
            <div className="mb-4 sm:hidden">
              <LanguageSwitcher onChange={(l) => void changeLanguage(l)} />
            </div>
            <SubscriptionBanner overview={billing.data} onBillingPage={pathname === '/billing'} />
            {children}
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}

/** Tells people who look after billing when the plan needs attention. Hidden on the billing page. */
function SubscriptionBanner({ overview, onBillingPage }: { overview: BillingOverviewDto | undefined; onBillingPage: boolean }) {
  const { t } = useI18n();
  const sub = overview?.subscription;
  if (!sub || onBillingPage) return null;
  const trialDays = sub.status === 'TRIALING' && sub.trialEndsAt ? Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86_400_000) : null;
  const message =
    sub.status === 'PAST_DUE'
      ? { tone: 'bg-pending-50 text-orange-800 border-orange-200', text: t('billingStatus.PAST_DUE') }
      : sub.status === 'EXPIRED' || sub.status === 'CANCELED'
        ? { tone: 'bg-failed-50 text-failed border-red-200', text: t('billing.ended') }
        : trialDays !== null && trialDays <= 3
          ? { tone: 'bg-brand-50 text-brand border-brand-100', text: t('billing.trialEndsIn', { days: Math.max(trialDays, 0) }) }
          : null;
  if (!message) return null;
  return (
    <div className={cn('mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm', message.tone)} role="status" data-testid="subscription-banner">
      <span>{message.text}</span>
      <Link href="/billing" className="font-semibold underline-offset-2 hover:underline">
        {t('billing.viewBilling')} →
      </Link>
    </div>
  );
}
