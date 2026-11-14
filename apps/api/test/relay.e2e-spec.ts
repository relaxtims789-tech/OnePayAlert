import type { INestApplication } from '@nestjs/common';
import type { AuthTokens, TransactionDto } from '@onepay/shared';
import request from 'supertest';
import { API, bearer, createTestApp, enrollPhone, login, prismaOf, registerMerchant, relayConnection, relayNotify, uniqueEmail, waitFor, PASSWORD } from './helpers';

describe('Phone bank alerts (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let owner: AuthTokens;
  let usd: { id: string; status: string };

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    owner = (await registerMerchant(app, 'Phone Alerts Shop')).tokens;
    usd = await relayConnection(app, owner, 'USD');
  });
  afterAll(() => app.close());

  const transactions = async (t: AuthTokens) =>
    ((await request(http).get(`${API}/transactions`).set('Authorization', bearer(t)).query({ pageSize: 100 }).expect(200)).body.items as TransactionDto[]);

  it('activates the connection at once and returns the phone secret only when it is set up', async () => {
    expect(usd.status).toBe('ACTIVE');
    const phone = await enrollPhone(app, owner, usd.id);
    expect(phone.secret).toMatch(/^[\w-]{40,}$/);
    const listed = (await request(http).get(`${API}/relay/phones`).set('Authorization', bearer(owner)).expect(200)).body;
    expect(listed).toEqual([expect.objectContaining({ id: phone.relayId, name: 'Owner phone', bankConnectionId: usd.id })]);
    expect(JSON.stringify(listed)).not.toContain(phone.secret);
    const row = await prismaOf(app).relayPhone.findUniqueOrThrow({ where: { id: phone.relayId } });
    expect(row.secretCiphertext).not.toContain(phone.secret);
  });

  it('records a bank alert as a REPORTED payment, once, and ignores what is not money in', async () => {
    const phone = await enrollPhone(app, owner, usd.id, 'Counter phone');
    const key = `aba-${Date.now()}`;
    const sent = await relayNotify(app, phone, { key, app: 'com.paygo24.ibank', title: 'ABA PAY', text: '$5.25 paid by SOK DARA (*123) via ABA PAY' }).expect(200);
    expect(sent.body).toEqual({ status: 'accepted' });

    const txn = await waitFor(async () => (await transactions(owner)).find((t) => t.amountMinor === 525));
    expect(txn).toMatchObject({ verification: 'REPORTED', isSimulated: false, status: 'SUCCESS', payerName: 'SOK DARA', currency: 'USD', providerCode: 'PHONE_ALERTS' });

    // Android may post the same notification again (updated, redelivered): counted once.
    expect((await relayNotify(app, phone, { key, text: '$5.25 paid by SOK DARA (*123) via ABA PAY' }).expect(200)).body).toEqual({ status: 'duplicate' });

    for (const [text, reason] of [
      ['You paid $4.50 to Brown Coffee', 'outgoing'],
      ['Your OTP is 482913', 'security_code'],
      ['Your statement is ready', 'not_incoming'],
    ] as const) {
      expect((await relayNotify(app, phone, { text }).expect(200)).body).toEqual({ status: 'ignored', reason });
    }
    expect((await relayNotify(app, phone, { text: 'Received $9.00', postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }).expect(200)).body).toEqual({
      status: 'ignored',
      reason: 'too_old',
    });
    const after = await prismaOf(app).relayPhone.findUniqueOrThrow({ where: { id: phone.relayId } });
    expect(after.lastSeenAt).not.toBeNull();
    expect(after.lastPaymentAt).not.toBeNull();
  });

  it('counts a payment once when two phones of the shop forward it', async () => {
    const a = await enrollPhone(app, owner, usd.id, 'Phone A');
    const b = await enrollPhone(app, owner, usd.id, 'Phone B');
    const text = 'Received USD 31.40 from KEO MALIS';
    expect((await relayNotify(app, a, { text }).expect(200)).body).toEqual({ status: 'accepted' });
    await waitFor(async () => (await transactions(owner)).some((t) => t.amountMinor === 3140));
    expect((await relayNotify(app, b, { text }).expect(200)).body).toEqual({ status: 'duplicate' });
  });

  it('routes riel alerts to the shop’s riel connection, or ignores them if there is none', async () => {
    const phone = await enrollPhone(app, owner, usd.id);
    const text = 'អ្នកបានទទួលប្រាក់ ៤០០០០៛ ពី សុខ ដារា';
    expect((await relayNotify(app, phone, { text }).expect(200)).body).toEqual({ status: 'ignored', reason: 'other_currency' });
    const khr = await relayConnection(app, owner, 'KHR');
    expect((await relayNotify(app, phone, { text }).expect(200)).body).toEqual({ status: 'accepted' });
    const txn = await waitFor(async () => (await transactions(owner)).find((t) => t.currency === 'KHR'));
    expect(txn).toMatchObject({ amountMinor: 4_000_000, bankConnectionId: khr.id, verification: 'REPORTED' });
  });

  it('refuses unsigned, mis-signed, stale, revoked and unknown phones alike', async () => {
    const phone = await enrollPhone(app, owner, usd.id);
    const text = 'Received $1.00 from TEST';
    await relayNotify(app, phone, { text }, { secret: 'wrong-secret' }).expect(401);
    await relayNotify(app, phone, { text }, { timestamp: Math.floor(Date.now() / 1000) - 3600 }).expect(401);
    await relayNotify(app, { relayId: '00000000-0000-4000-8000-000000000000', secret: phone.secret }, { text }).expect(401);
    await request(http).post(`${API}/relay/notifications`).send({ key: 'k-unsigned-1', app: 'x', text, postedAt: new Date().toISOString() }).expect(401);

    await request(http).delete(`${API}/relay/phones/${phone.relayId}`).set('Authorization', bearer(owner)).expect(204);
    await relayNotify(app, phone, { text }).expect(401);
    expect((await request(http).get(`${API}/relay/phones`).set('Authorization', bearer(owner)).expect(200)).body.map((p: { id: string }) => p.id)).not.toContain(phone.relayId);
  });

  it('lets only owners and admins set up phones, and only on a phone-alert connection of their own company', async () => {
    const email = uniqueEmail('relay.cashier');
    await request(http).post(`${API}/employees`).set('Authorization', bearer(owner)).send({ email, fullName: 'Cashier', role: 'CASHIER', initialPassword: PASSWORD }).expect(201);
    const cashier = await login(app, email);
    await request(http).post(`${API}/relay/phones`).set('Authorization', bearer(cashier)).send({ bankConnectionId: usd.id, name: 'Mine' }).expect(403);

    const other = await registerMerchant(app, 'Other Relay Shop');
    const r = await request(http).post(`${API}/relay/phones`).set('Authorization', bearer(other.tokens)).send({ bankConnectionId: usd.id, name: 'Steal' }).expect(400);
    expect(r.body.code).toBe('RELAY_CONNECTION_REQUIRED');
    expect((await request(http).get(`${API}/relay/phones`).set('Authorization', bearer(other.tokens)).expect(200)).body).toEqual([]);
  });
});
