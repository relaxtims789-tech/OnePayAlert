import { hasSessionCookie } from '@onepay/web-core/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await hasSessionCookie()) redirect('/overview');
  return children;
}
