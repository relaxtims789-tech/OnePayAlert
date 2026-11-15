import { hasSessionCookie } from '@onepay/web-core/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from './app-shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // No session cookie → sign in. Token validity is enforced by the API on every call.
  if (!(await hasSessionCookie())) redirect('/login');
  // Read at request time, so one image serves every environment.
  const adminUrl = process.env.ADMIN_URL?.replace(/\/$/, '') || undefined;
  return <AppShell adminUrl={adminUrl}>{children}</AppShell>;
}
