import 'server-only';
import type { AuthTokens } from '@onepay/shared';
import { cookies } from 'next/headers';
import { createRefresher } from './refresher';

export type { RefreshResult } from './refresher';

/**
 * Backend-for-frontend session handling. The refresh token and access token live only in
 * httpOnly cookies; browser JavaScript never sees the refresh token.
 *
 * Cookie names are prefixed per app (SESSION_COOKIE_PREFIX, default "op"): browsers share
 * cookies across ports on the same host, so the merchant and admin dashboards must not
 * overwrite each other's sessions.
 */
const prefix = () => (process.env.SESSION_COOKIE_PREFIX ?? 'op').replace(/[^a-z0-9]/gi, '');
export const accessCookieName = () => `${prefix()}_at`;
export const refreshCookieName = () => `${prefix()}_rt`;
const REFRESH_MAX_AGE = 30 * 24 * 3600;

export const apiUrl = () => (process.env.API_URL ?? 'http://localhost:4100').replace(/\/$/, '');
export const realtimeUrl = () => (process.env.REALTIME_URL ?? apiUrl()).replace(/\/$/, '');

const secure = () => process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';

export async function setSessionCookies(tokens: AuthTokens): Promise<void> {
  const jar = await cookies();
  const base = { httpOnly: true, sameSite: 'lax' as const, secure: secure(), path: '/' };
  jar.set(accessCookieName(), tokens.accessToken, { ...base, maxAge: Math.max(tokens.accessTokenExpiresIn - 30, 30) });
  jar.set(refreshCookieName(), tokens.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(accessCookieName());
  jar.delete(refreshCookieName());
}

export async function readSession(): Promise<{ accessToken?: string; refreshToken?: string }> {
  const jar = await cookies();
  return { accessToken: jar.get(accessCookieName())?.value, refreshToken: jar.get(refreshCookieName())?.value };
}

/** True when a session cookie exists (used by server layouts to redirect to sign-in). */
export async function hasSessionCookie(): Promise<boolean> {
  return (await cookies()).has(refreshCookieName());
}

// One refresher per server process (survives module re-instantiation in dev).
const g = globalThis as typeof globalThis & { __onepayRefresh?: ReturnType<typeof createRefresher> };
export const refreshSession = (g.__onepayRefresh ??= createRefresher((...a) => fetch(...a), apiUrl));

/**
 * Returns a valid access token, refreshing (and re-setting cookies) when needed.
 * `null` means the user must sign in again (cookies are cleared).
 */
export async function ensureAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = await readSession();
  if (accessToken) return accessToken;
  if (!refreshToken) return null;
  const r = await refreshSession(refreshToken);
  if (r.ok) {
    await setSessionCookies(r.tokens);
    return r.tokens.accessToken;
  }
  if (r.status === 401 || r.status === 403) await clearSessionCookies();
  return null;
}

/** Calls the backend API from the server with the current session. */
export async function backendFetch(path: string, init: RequestInit = {}, accessToken?: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${apiUrl()}/api/v1/${path.replace(/^\//, '')}`, { ...init, headers, cache: 'no-store' });
}

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function isSameOrigin(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
