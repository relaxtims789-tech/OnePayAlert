import { BakongError, LiveBakongClient, parseBakongTransaction } from './bakong.client';

/** Bakong Open API responses as documented by NBC / seen by existing clients. */
const PAID = {
  responseCode: 0,
  responseMessage: 'Getting transaction successfully.',
  errorCode: null,
  data: {
    hash: '8465d722d7d5065f2886bb0b8ff7f5da29fb8b5a0d5f6c7c2a7e7f4b2c3e6a10',
    fromAccountId: 'chan_sophea@aclb',
    toAccountId: 'sokha_coffee@aclb',
    currency: 'USD',
    amount: 12.5,
    description: 'OPA7K2M9QX',
    createdDateMs: 1794544800000,
    acknowledgedDateMs: 1794544801000,
  },
};
const NOT_FOUND = { responseCode: 1, responseMessage: 'Transaction could not be found. Please check and try again.', errorCode: 1, data: null };

function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('LiveBakongClient', () => {
  it('checks a code by MD5 with the bearer token and parses a paid transfer', async () => {
    const f = fakeFetch(() => ({ status: 200, body: PAID }));
    const client = new LiveBakongClient('https://api-bakong.nbc.gov.kh/', 'token-123', f.impl);
    const tx = await client.checkMd5('d41d8cd98f00b204e9800998ecf8427e');
    expect(f.calls[0]!.url).toBe('https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5');
    expect(f.calls[0]!.init.method).toBe('POST');
    expect((f.calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ md5: 'd41d8cd98f00b204e9800998ecf8427e' });
    expect(tx).toEqual({
      hash: PAID.data.hash,
      fromAccountId: 'chan_sophea@aclb',
      toAccountId: 'sokha_coffee@aclb',
      currency: 'USD',
      amount: '12.5',
      description: 'OPA7K2M9QX',
      occurredAt: new Date(1794544801000),
    });
  });

  it('treats "not found" as not paid yet', async () => {
    const client = new LiveBakongClient('https://bakong.test', 't', fakeFetch(() => ({ status: 200, body: NOT_FOUND })).impl);
    expect(await client.checkMd5('x')).toBeNull();
  });

  it('separates retryable outages from a rejected token', async () => {
    const down = new LiveBakongClient('https://bakong.test', 't', fakeFetch(() => ({ status: 503, body: {} })).impl);
    await expect(down.checkMd5('x')).rejects.toMatchObject({ retryable: true });
    const denied = new LiveBakongClient('https://bakong.test', 't', fakeFetch(() => ({ status: 401, body: {} })).impl);
    await expect(denied.checkMd5('x')).rejects.toMatchObject({ retryable: false });
    const unreachable = new LiveBakongClient('https://bakong.test', 't', (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);
    await expect(unreachable.checkMd5('x')).rejects.toBeInstanceOf(BakongError);
  });

  it('checks up to 50 codes at once and returns the paid ones', async () => {
    const f = fakeFetch(() => ({
      status: 200,
      body: { responseCode: 0, data: [{ md5: 'a', status: 'SUCCESS' }, { md5: 'b', status: 'NOT_FOUND' }, { md5: 'c', status: 'STATIC_QR' }] },
    }));
    const client = new LiveBakongClient('https://bakong.test', 't', f.impl);
    expect(await client.paidAmong(['a', 'b', 'c'])).toEqual(new Set(['a']));
    expect(f.calls[0]!.url).toBe('https://bakong.test/v1/check_transaction_by_md5_list');
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual(['a', 'b', 'c']);
    await expect(client.paidAmong(Array.from({ length: 51 }, (_, i) => String(i)))).rejects.toBeInstanceOf(BakongError);
  });

  it('checks that a Bakong account exists', async () => {
    const yes = new LiveBakongClient('https://bakong.test', 't', fakeFetch(() => ({ status: 200, body: { responseCode: 0 } })).impl);
    const no = new LiveBakongClient('https://bakong.test', 't', fakeFetch(() => ({ status: 200, body: { responseCode: 1 } })).impl);
    expect(await yes.accountExists('shop@aclb')).toBe(true);
    expect(await no.accountExists('nobody@aclb')).toBe(false);
  });

  it('accepts string amounts and missing dates', () => {
    const tx = parseBakongTransaction({ hash: 'h', amount: '18000', currency: 'khr' });
    expect(tx).toMatchObject({ amount: '18000', currency: 'KHR', fromAccountId: null });
    expect(tx.occurredAt).toBeInstanceOf(Date);
    expect(() => parseBakongTransaction({ amount: 1 })).toThrow(BakongError);
  });
});
