import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { REFRESH_COOKIE } from '@/lib/server/session';
import { AuthFrame } from './auth-frame';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Already signed in → go straight to the dashboard.
  if ((await cookies()).get(REFRESH_COOKIE)) redirect('/dashboard');
  return <AuthFrame>{children}</AuthFrame>;
}
