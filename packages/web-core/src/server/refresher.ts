import type { AuthTokens } from '@onepay/shared';

export type RefreshResult = { ok: true; tokens: AuthTokens } | { ok: false; status: number };
type Fetcher = typeof fetch;
interface Pending {
  promise: Promise<RefreshResult>;
  until: number;
}

/**
 * Refresh tokens are single-use (reuse revokes every session). When a page fires several
 * requests at once with the same expired access token, they must share ONE refresh call;
 * the result is also kept briefly for requests that still carry the old cookie.
 */
export function createRefresher(fetcher: Fetcher, baseUrl: () => string, graceMs = 15_000) {
  const pending = new Map<string, Pending>();
  return function refresh(refreshToken: string): Promise<RefreshResult> {
    const now = Date.now();
    for (const [k, v] of pending) if (v.until < now) pending.delete(k);
    const existing = pending.get(refreshToken);
    if (existing) return existing.promise;

    const promise = (async (): Promise<RefreshResult> => {
      try {
        const res = await fetcher(`${baseUrl()}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          cache: 'no-store',
        });
        if (!res.ok) return { ok: false, status: res.status };
        return { ok: true, tokens: (await res.json()) as AuthTokens };
      } catch {
        return { ok: false, status: 503 };
      }
    })();
    pending.set(refreshToken, { promise, until: now + graceMs });
    return promise;
  };
}
