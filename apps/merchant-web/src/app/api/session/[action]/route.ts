import type { AuthTokens } from '@onepay/shared';
import { NextResponse, type NextRequest } from 'next/server';
import {
  backendFetch,
  clearSessionCookies,
  ensureAccessToken,
  isSameOrigin,
  readSession,
  realtimeUrl,
  setSessionCookies,
} from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Forwards a token-minting call to the API and stores the tokens in httpOnly cookies. */
async function mint(path: string, body: string, accessToken?: string | null) {
  let res: Response;
  try {
    res = await backendFetch(path, { method: 'POST', body }, accessToken);
  } catch {
    return json(503, { statusCode: 503, message: 'API unavailable' });
  }
  const data = (await res.json().catch(() => ({}))) as Partial<AuthTokens> & Record<string, unknown>;
  if (!res.ok || !data.accessToken || !data.refreshToken) {
    return json(res.status === 200 || res.status === 201 ? 502 : res.status, data);
  }
  await setSessionCookies(data as AuthTokens);
  return json(200, { ok: true });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!isSameOrigin(req)) return json(403, { statusCode: 403, message: 'Cross-site request blocked' });
  const body = await req.text();

  switch (action) {
    case 'login':
      return mint('auth/login', body);
    case 'register':
      return mint('auth/register', body);
    case 'switch-company': {
      const token = await ensureAccessToken();
      if (!token) return json(401, { statusCode: 401, code: 'SESSION_EXPIRED', message: 'Session expired' });
      return mint('auth/switch-company', body, token);
    }
    case 'logout': {
      const { refreshToken } = await readSession();
      if (refreshToken) {
        await backendFetch('auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => null);
      }
      await clearSessionCookies();
      return json(200, { ok: true });
    }
    default:
      return json(404, { statusCode: 404, message: 'Not found' });
  }
}

/**
 * GET /api/session/token — short-lived access token for the realtime socket only
 * (Socket.IO cannot use httpOnly cookies cross-origin). The refresh token never leaves the server.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action !== 'token') return json(404, { statusCode: 404, message: 'Not found' });
  const accessToken = await ensureAccessToken();
  if (!accessToken) return json(401, { statusCode: 401, code: 'SESSION_EXPIRED', message: 'Session expired' });
  return json(200, { accessToken, realtimeUrl: realtimeUrl() });
}
