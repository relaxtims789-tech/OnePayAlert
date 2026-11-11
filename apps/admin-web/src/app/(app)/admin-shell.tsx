'use client';

import { Badge, ErrorState, LogoMark, Spinner, cn } from '@onepay/ui';
import { session, setSessionExpiredHandler } from '@onepay/web-core/client';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Building2, Gauge, Landmark, LogOut, Menu, ReceiptText, ScrollText, ShieldCheck, UserCog, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/common';
import { errorText, useMe } from '@/lib/hooks';
import { useI18n, type MessageKey } from '@/lib/i18n';

const NAV: { href: string; label: MessageKey; icon: typeof Gauge }[] = [
  { href: '/overview', label: 'nav.overview', icon: Gauge },
  { href: '/merchants', label: 'nav.merchants', icon: Building2 },
  { href: '/plans', label: 'nav.plans', icon: ReceiptText },
  { href: '/providers', label: 'nav.providers', icon: Landmark },
  { href: '/audit', label: 'nav.audit', icon: ScrollText },
  { href: '/health', label: 'nav.health', icon: Activity },
  { href: '/account', label: 'nav.account', icon: UserCog },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useMe();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      qc.clear();
      window.location.assign('/login?expired=1');
    });
  }, [qc]);
  useEffect(() => setOpen(false), [pathname]);

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
  if (me.isError || !me.data.platformRole) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <ErrorState
          title={t('common.somethingWrong')}
          message={me.isError ? errorText(me.error, t) : t('auth.notStaff')}
          onRetry={() => void signOut()}
          retryLabel={t('common.signOut')}
        />
      </div>
    );
  }
  const user = me.data;
  const role = me.data.platformRole; // narrowed to non-null by the guard above
  const readOnly = role === 'SUPPORT';

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4" aria-label="Main">
      <div className="mb-6 flex items-center justify-between px-2 pt-1">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <div className="leading-tight">
            <p className="text-[15px] font-bold text-white">One PayAlert</p>
            <p className="flex items-center gap-1 text-[11px] text-white/50">
              <ShieldCheck className="size-3" aria-hidden />
              {t('common.console')}
            </p>
          </div>
        </div>
        <button type="button" className="rounded-lg p-1.5 text-white/60 lg:hidden" onClick={() => setOpen(false)} aria-label={t('common.close')}>
          <X className="size-5" />
        </button>
      </div>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'bg-brand text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
            {t(item.label)}
          </Link>
        );
      })}
      <div className="mt-auto space-y-3 rounded-2xl bg-white/5 p-4">
        <div>
          <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
          <p className="truncate text-xs text-white/50">{user.email}</p>
        </div>
        <Badge tone={readOnly ? 'pending' : 'brand'}>{t(`account.${role}`)}</Badge>
        <LanguageSwitcher dark className="w-full [&_select]:w-full" />
        <button
          type="button"
          onClick={() => void signOut()}
          data-testid="sign-out"
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" aria-hidden />
          {t('common.signOut')}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh bg-ink lg:block">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="relative h-full w-72 max-w-[85%] bg-ink shadow-pop">{sidebar}</aside>
        </div>
      ) : null}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur lg:hidden">
          <button type="button" className="rounded-lg p-2 text-ink-2 hover:bg-surface" onClick={() => setOpen(true)} aria-label={t('common.menu')}>
            <Menu className="size-5" />
          </button>
          <p className="font-semibold text-ink">{t('common.console')}</p>
        </header>
        {readOnly ? (
          <div className="border-b border-orange-200 bg-pending-50 px-6 py-2 text-center text-xs font-medium text-orange-800">{t('common.readOnly')}</div>
        ) : null}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
