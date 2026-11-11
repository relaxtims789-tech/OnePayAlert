import { InvalidPayloadError, maskAccount, parseOnePayV1, signOnePayV1, verifyOnePayV1 } from './adapters';

const valid = {
  eventId: 'evt_1',
  type: 'payment.succeeded',
  transactionId: 'txn_1',
  amount: '12.50',
  currency: 'USD',
  occurredAt: '2026-11-11T08:00:00+07:00',
  payer: { name: 'Sok Dara', account: '000 123 456' },
};

describe('ONEPAY_WEBHOOK_V1 adapter', () => {
  it('normalises a valid payload into integer minor units', () => {
    const e = parseOnePayV1(valid);
    expect(e.amountMinor).toBe(1250n);
    expect(e.status).toBe('SUCCESS');
    expect(e.payerAccountMasked).toBe('•••• 3456');
    expect(e.occurredAt.toISOString()).toBe('2026-11-11T01:00:00.000Z');
  });

  it('rejects floats, unknown fields, bad currencies and future timestamps', () => {
    expect(() => parseOnePayV1({ ...valid, amount: 12.5 })).toThrow(InvalidPayloadError);
    expect(() => parseOnePayV1({ ...valid, amount: '1.234' })).toThrow(/decimal places/);
    expect(() => parseOnePayV1({ ...valid, amount: '-1.00' })).toThrow(InvalidPayloadError);
    expect(() => parseOnePayV1({ ...valid, currency: 'THB' })).toThrow(InvalidPayloadError);
    expect(() => parseOnePayV1({ ...valid, extra: true })).toThrow(InvalidPayloadError);
    expect(() =>
      parseOnePayV1({ ...valid, occurredAt: new Date(Date.now() + 3_600_000).toISOString() }),
    ).toThrow(/future/);
  });

  it('verifies HMAC signatures with replay protection', () => {
    const body = Buffer.from(JSON.stringify(valid));
    const now = 1_800_000_000;
    const headers = { 'x-onepay-timestamp': String(now), 'x-onepay-signature': signOnePayV1('s3cret', now, body) };
    expect(verifyOnePayV1(headers, body, 's3cret', now)).toBe(true);
    expect(verifyOnePayV1(headers, body, 'wrong', now)).toBe(false);
    expect(verifyOnePayV1(headers, Buffer.from(body.toString() + ' '), 's3cret', now)).toBe(false);
    expect(verifyOnePayV1(headers, body, 's3cret', now + 301)).toBe(false);
    expect(verifyOnePayV1({}, body, 's3cret', now)).toBe(false);
  });

  it('masks account numbers', () => {
    expect(maskAccount('1234567890')).toBe('•••• 7890');
    expect(maskAccount('123')).toBe('••••');
  });
});
