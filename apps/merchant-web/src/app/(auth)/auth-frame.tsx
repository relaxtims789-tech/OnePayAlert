'use client';

import { Logo } from '@onepay/ui';
import { BellRing, Building2, Landmark, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useI18n } from '@/lib/i18n';

export function AuthFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const points = t('auth.heroPoints').split(' · ');
  const icons = [Landmark, BellRing, Building2];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-2 via-brand to-[#043a7a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/5 blur-2xl" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <ShieldCheck className="size-5" aria-hidden />
          </div>
          <p className="text-lg font-bold tracking-tight">One PayAlert</p>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold">{t('auth.heroTitle')}</h2>
          <ul className="mt-8 space-y-4">
            {points.map((p, i) => {
              const Icon = icons[i % icons.length]!;
              return (
                <li key={p} className="flex items-center gap-3 text-white/90">
                  <span className="grid size-9 place-items-center rounded-xl bg-white/15">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  {p}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">© Mysoftkh</p>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <LanguageSwitcher />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-xs text-ink-3">{t('common.tagline')}</p>
      </main>
    </div>
  );
}
