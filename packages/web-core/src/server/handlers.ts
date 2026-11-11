import 'server-only';
import type { AuthTokens, MeResponse } from '@onepay/shared';
import { NextResponse, type NextRequest } from 'next/server';
import {
  backendFetch,
  clearSessionCookies,
  ensureAccessToken,
  isSameOrigin,
  readSession,
  realtimeUrl,
  refreshSession,
  setSessionCookies,
} from './session';

const json = (status: number, body: unknown) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

export interface ProxyOptions {
  /** If set, ONLY these API paths are reachable (allow-list). */
  allow?: RegExp[];
  /** Always unreachable, checked before `allow`. */
  block?: RegExp[];
}

/** Endpoints that mint or revoke tokens are never reachable from browser JavaScript. */
const ALWAYS_BLOCKED = [/^auth\/(login|register|refresh|logout|switch-company)$/, /^webhooks\//];

/**
 * Same-origin proxy from the browser to the REST API. Attaches the access token from the
 * httpOnly cookie and transparently refreshes it once on 401.
 */
export function createProxyHandler(opts: ProxyOptions = {}) {
  const blocked = [...ALWAYS_BLOCKED, ...(opts.block ?? [])];

  return async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
    const { path } = await ctx.params;
    const joined = path.map(encodeURIComponent).join('/');
    if (blocked.some((r) => r.test(joined)) || (opts.allow && !opts.allow.some((r) => r.test(joined)))) {
      return json(404, { statusCode: 404, message: 'Not found' });
    }
    if (!isSameOrigin(req)) return json(403, { statusCode: 403, message: 'Cross-site request blocked' });

    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
    const target = `${joined}${req.nextUrl.search}`;
    const forward = (token?: string | null) =>
      backendFetch(
        target,
        {
          method: req.method,
          body: body || undefined,
          headers: {
            'Content-Type': req.headers.get('content-type') ?? 'application/json',
            'Accept-Language': req.headers.get('accept-language') ?? '',
          },
        },
        token,
      );

    const session = await readSession();
    let accessToken = session.accessToken;
    let refreshed = false;
    const tryRefresh = async (): Promise<boolean> => {
      if (!session.refreshToken || refreshed) return false;
      refreshed = true;
      const r = await refreshSession(session.refreshToken);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) await clearSessionCookies();
        return false;
      }
      await setSessionCookies(r.tokens);
      accessToken = r.tokens.accessToken;
      return true;
    };

    if (!accessToken) await tryRefresh();
    let res: Response;
    try {
      res = await forward(accessToken);
      if (res.status === 401 && (await tryRefresh())) res = await forward(accessToken);
    } catch {
      return json(503, { statusCode: 503, message: 'API unavailable' });
    }

    // The API only answers 401 for an invalid session (and we already tried one refresh).
    if (res.status === 401) {
      await clearSessionCookies();
      return json(401, { statusCode: 401, code: 'SESSION_EXPIRED', message: 'Session expired' });
    }

    const headers = new Headers({ 'cache-control': 'no-store' });
    const ct = res.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    return new NextResponse(res.status === 204 ? null : res.body, { status: res.status, headers });
  };
}

export interface SessionOptions {
  /** Allow self-service registration through this app. */
  allowRegister?: boolean;
  /** Only users with a MysoftKH platform role may sign in (Super Admin dashboard). */
  requirePlatformRole?: boolean;
}

/**
 * /api/session/[action]: login, register, logout, switch-company (POST) and token (GET).
 * Tokens are stored in httpOnly cookies; only `{ ok: true }` is returned to the browser.
 */
export function createSessionHandlers(opts: SessionOptions = {}) {
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
    const tokens = data as AuthTokens;

    if (opts.requirePlatformRole) {
      const me = await backendFetch('auth/me', {}, tokens.accessToken)
        .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
        .catch(() => null);
      if (!me?.platformRole) {
        // Do not leave a usable session behind for a non-staff account.
        await backendFetch('auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: tokens.refreshToken }) }).catch(() => null);
        return json(403, { statusCode: 403, code: 'NOT_PLATFORM_STAFF', message: 'This account is not a MysoftKH staff account.' });
      }
    }
    await setSessionCookies(tokens);
    return json(200, { ok: true });
  }

  async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
    const { action } = await ctx.params;
    if (!isSameOrigin(req)) return json(403, { statusCode: 403, message: 'Cross-site request blocked' });
    const body = await req.text();
    switch (action) {
      case 'login':
        return mint('auth/login', body);
      case 'register':
        if (!opts.allowRegister) break;
        return mint('auth/register', body);
      case 'switch-company': {
        if (opts.requirePlatformRole) break;
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
    }
    return json(404, { statusCode: 404, message: 'Not found' });
  }

  /**
   * GET /api/session/token — short-lived access token for the realtime socket only
   * (Socket.IO cannot use httpOnly cookies cross-origin). The refresh token never leaves the server.
   */
  async function GET(_req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
    const { action } = await ctx.params;
    if (action !== 'token') return json(404, { statusCode: 404, message: 'Not found' });
    const accessToken = await ensureAccessToken();
    if (!accessToken) return json(401, { statusCode: 401, code: 'SESSION_EXPIRED', message: 'Session expired' });
    return json(200, { accessToken, realtimeUrl: realtimeUrl() });
  }

  return { GET, POST };
}
