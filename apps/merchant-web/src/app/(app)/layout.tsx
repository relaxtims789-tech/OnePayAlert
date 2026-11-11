import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { REFRESH_COOKIE } from '@/lib/server/session';
import { AppShell } from './app-shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // No session cookie → sign in. Token validity is enforced by the API on every call.
  if (!(await cookies()).get(REFRESH_COOKIE)) redirect('/login');
  return <AppShell>{children}</AppShell>;
}
