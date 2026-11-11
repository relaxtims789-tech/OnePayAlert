import { LogoMark } from '@onepay/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <LogoMark className="mx-auto size-12" />
        <p className="mt-6 text-5xl font-semibold text-brand">404</p>
        <p className="mt-2 text-ink-2">Page not found · រកមិនឃើញទំព័រ · 页面不存在</p>
        <Link href="/overview" className="mt-6 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover">
          CAM Admin
        </Link>
      </div>
    </main>
  );
}
