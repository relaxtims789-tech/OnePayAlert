import { hasSessionCookie } from '@onepay/web-core/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from './admin-shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await hasSessionCookie())) redirect('/login');
  return <AdminShell>{children}</AdminShell>;
}
