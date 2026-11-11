import { describe, expect, it, vi } from 'vitest';
import { createRefresher } from './refresher';

const tokens = { accessToken: 'a2', refreshToken: 'r2', accessTokenExpiresIn: 900 };

describe('createRefresher', () => {
  it('collapses concurrent refreshes of the same token into one API call', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(tokens), { status: 200 }));
    const refresh = createRefresher(fetcher as unknown as typeof fetch, () => 'http://api');
    const results = await Promise.all([refresh('r1'), refresh('r1'), refresh('r1')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.ok && r.tokens.refreshToken === 'r2')).toBe(true);
    // A late request still carrying the old cookie gets the same result, not a reuse error.
    await refresh('r1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reports failures without throwing', async () => {
    const refresh = createRefresher((async () => new Response('{}', { status: 401 })) as unknown as typeof fetch, () => 'http://api');
    expect(await refresh('bad')).toEqual({ ok: false, status: 401 });
    const down = createRefresher((async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch, () => 'http://api');
    expect(await down('x')).toEqual({ ok: false, status: 503 });
  });

  it('expires cached results after the grace period', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(tokens), { status: 200 }));
    const refresh = createRefresher(fetcher as unknown as typeof fetch, () => 'http://api', 0);
    await refresh('r1');
    await new Promise((r) => setTimeout(r, 5));
    await refresh('r1');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
