import { NextResponse, type NextRequest } from 'next/server';
import {
  backendFetch,
  clearSessionCookies,
  isSameOrigin,
  readSession,
  refreshSession,
  setSessionCookies,
} from '@/lib/server/session';

export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy from the browser to the REST API. It attaches the access token from the
 * httpOnly cookie and transparently refreshes it once on 401. Endpoints that mint or revoke
 * tokens are not reachable here — they go through /api/session/* so tokens never reach JS.
 */
const BLOCKED = [/^auth\/(login|register|refresh|logout|switch-company)$/, /^webhooks\//];

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.map(encodeURIComponent).join('/');
  if (BLOCKED.some((r) => r.test(joined))) {
    return NextResponse.json({ statusCode: 404, message: 'Not found' }, { status: 404 });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ statusCode: 403, message: 'Cross-site request blocked' }, { status: 403 });
  }

  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  const target = `${joined}${req.nextUrl.search}`;
  const forward = (token?: string | null) =>
    backendFetch(target, {
      method: req.method,
      body: body || undefined,
      headers: { 'Content-Type': req.headers.get('content-type') ?? 'application/json', 'Accept-Language': req.headers.get('accept-language') ?? '' },
    }, token);

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
    return NextResponse.json({ statusCode: 503, message: 'API unavailable' }, { status: 503 });
  }

  // The API only answers 401 for an invalid session (and we already tried one refresh).
  if (res.status === 401) {
    await clearSessionCookies();
    return NextResponse.json({ statusCode: 401, code: 'SESSION_EXPIRED', message: 'Session expired' }, { status: 401 });
  }

  const headers = new Headers();
  const ct = res.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  headers.set('cache-control', 'no-store');
  return new NextResponse(res.status === 204 ? null : res.body, { status: res.status, headers });
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
