import { hasSessionCookie } from '@onepay/web-core/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthFrame } from './auth-frame';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Already signed in → go straight to the dashboard.
  if (await hasSessionCookie()) redirect('/dashboard');
  return <AuthFrame>{children}</AuthFrame>;
}
