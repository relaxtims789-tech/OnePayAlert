import { daysLeft, khqrHealthStatus } from './bakong-health.service';
import { LiveBakongClient, tokenExpiry } from './bakong.client';

const jwt = (payload: object) =>
  ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)].map((p) => Buffer.from(p).toString('base64url')).join('.') + '.signature';

const now = new Date('2026-11-13T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
const fine = { lastOkAt: days(-0.001), lastErrorAt: null, lastError: null, rejected: false };

describe('Bakong token expiry', () => {
  it('reads exp from a JWT token and ignores anything else', () => {
    expect(tokenExpiry(jwt({ exp: 1_800_000_000 }))).toEqual(new Date(1_800_000_000_000));
    expect(tokenExpiry(jwt({ sub: 'merchant' }))).toBeNull();
    expect(tokenExpiry('not-a-jwt-token-at-all')).toBeNull();
    expect(tokenExpiry('a.%%%.c')).toBeNull();
    expect(new LiveBakongClient('https://bakong.test', jwt({ exp: 1_800_000_000 })).tokenExpiresAt).toEqual(new Date(1_800_000_000_000));
  });
});

describe('days left on the token', () => {
  it('rounds remaining time up and counts expired tokens as negative', () => {
    expect(daysLeft(days(9.99), now)).toBe(10);
    expect(daysLeft(days(0.2), now)).toBe(1);
    expect(daysLeft(days(-0.2), now)).toBe(-1);
  });
});

describe('KHQR health verdict', () => {
  it('passes simulated and off through', () => {
    expect(khqrHealthStatus('simulated', null, fine, now)).toBe('simulated');
    expect(khqrHealthStatus('off', null, fine, now)).toBe('off');
  });

  it('is an error when the token is rejected or expired', () => {
    expect(khqrHealthStatus('live', days(60), { ...fine, rejected: true }, now)).toBe('error');
    expect(khqrHealthStatus('live', days(-1), fine, now)).toBe('error');
  });

  it('warns 14 days before expiry and while calls are failing', () => {
    expect(khqrHealthStatus('live', days(14), fine, now)).toBe('warning');
    expect(khqrHealthStatus('live', days(15), fine, now)).toBe('ok');
    const failing = { lastOkAt: days(-0.01), lastErrorAt: days(-0.001), lastError: 'Bakong HTTP 503', rejected: false };
    expect(khqrHealthStatus('live', null, failing, now)).toBe('warning');
    // An old failure followed by nothing does not keep the warning forever.
    expect(khqrHealthStatus('live', null, { ...failing, lastErrorAt: days(-1) }, now)).toBe('ok');
    // A success after the failure clears it.
    expect(khqrHealthStatus('live', null, { ...failing, lastOkAt: days(-0.0001) }, now)).toBe('ok');
  });
});
