// The official NBC SDK is a test-only dependency: it is the reference our encoder must match.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BakongKHQR, IndividualInfo, khqrData } = require('bakong-khqr');
import { crc16, encodeKhqr, khqrAmount, khqrSafeText, KhqrInputError } from './khqr-encoder';

const NOW = new Date('2026-11-13T03:00:00.000Z');
const EXPIRES = new Date(NOW.getTime() + 5 * 60_000);

function official(opts: { currency: 'USD' | 'KHR'; amount?: number; billNumber?: string; storeLabel?: string; terminalLabel?: string }) {
  // Actual signature (the SDK README shows an older one): (accountId, name, city, optional).
  const info = new IndividualInfo('sokha_coffee@aclb', 'Sokha Coffee', 'Phnom Penh', {
    currency: khqrData.currency[opts.currency.toLowerCase()],
    ...(opts.amount !== undefined ? { amount: opts.amount, expirationTimestamp: EXPIRES.getTime() } : {}),
    billNumber: opts.billNumber,
    storeLabel: opts.storeLabel,
    terminalLabel: opts.terminalLabel,
  });
  const res = new BakongKHQR().generateIndividual(info);
  if (res.status?.code !== 0) throw new Error(`SDK error: ${JSON.stringify(res.status)}`);
  return res.data as { qr: string; md5: string };
}

describe('KHQR encoder (matches the official NBC bakong-khqr SDK)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: NOW });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it.each([
    ['USD with cents', { currency: 'USD' as const, amount: 12.5, minor: 1250 }],
    ['whole USD', { currency: 'USD' as const, amount: 12, minor: 1200 }],
    ['small USD', { currency: 'USD' as const, amount: 0.05, minor: 5 }],
    ['KHR', { currency: 'KHR' as const, amount: 18000, minor: 1_800_000 }],
  ])('%s: identical QR and MD5', (_name, c) => {
    const ref = official({ currency: c.currency, amount: c.amount, billNumber: 'OPA7K2M9QX', storeLabel: 'Riverside', terminalLabel: 'One PayAlert' });
    const ours = encodeKhqr({
      bakongAccountId: 'sokha_coffee@aclb',
      merchantName: 'Sokha Coffee',
      merchantCity: 'Phnom Penh',
      currency: c.currency,
      amountMinor: c.minor,
      billNumber: 'OPA7K2M9QX',
      storeLabel: 'Riverside',
      terminalLabel: 'One PayAlert',
      createdAt: NOW,
      expiresAt: EXPIRES,
    });
    expect(ours).toEqual(ref);
    expect(BakongKHQR.verify(ours.qr).isValid).toBe(true);
    const decoded = BakongKHQR.decode(ours.qr).data;
    expect(decoded.bakongAccountID).toBe('sokha_coffee@aclb');
    expect(decoded.merchantName).toBe('Sokha Coffee');
    expect(decoded.billNumber).toBe('OPA7K2M9QX');
  });

  it('builds a static QR (no amount) identical to the SDK', () => {
    const ref = official({ currency: 'USD' });
    expect(encodeKhqr({ bakongAccountId: 'sokha_coffee@aclb', merchantName: 'Sokha Coffee', currency: 'USD' })).toEqual(ref);
  });

  it('computes the CRC of the SDK README example', () => {
    const example =
      '00020101021230190015john_smith@devb5204599953038405405500.05802KH5910John Smith6010Phnom Penh62640111Invoice#0690314Coffee Khlaing0727Cooooooooooooooooooounter 299340013172734056490701131727340624907630458D8';
    expect(crc16(example.slice(0, -4))).toBe('58D8');
  });

  it('refuses input the SDK would refuse', () => {
    const base = { bakongAccountId: 'shop@aclb', merchantName: 'Shop', currency: 'USD' as const, createdAt: NOW, expiresAt: EXPIRES };
    expect(() => khqrAmount(1_050, 'KHR')).toThrow(KhqrInputError); // 10.50 riel
    expect(() => encodeKhqr({ ...base, amountMinor: -5 })).toThrow(KhqrInputError);
    expect(() => encodeKhqr({ ...base, merchantName: 'ហាងកាហ្វេ', amountMinor: 100 })).toThrow(KhqrInputError);
    expect(() => encodeKhqr({ ...base, merchantName: 'A'.repeat(26), amountMinor: 100 })).toThrow(KhqrInputError);
    expect(() => encodeKhqr({ ...base, amountMinor: 100, expiresAt: NOW })).toThrow(KhqrInputError);
  });

  it('turns names into KHQR-safe Latin text', () => {
    expect(khqrSafeText('  Café   Riverside ', 25)).toBe('Cafe Riverside');
    expect(khqrSafeText('ហាង BKK1', 25)).toBe('BKK1');
  });
});
