import type { INestApplication } from '@nestjs/common';
import type {
  AuthTokens,
  BankConnectionWithSecretDto,
  PaymentProviderDto,
  TransactionDto,
} from '@onepay/shared';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { PushMessage, PushSender } from '../src/notifications/push.sender';
import { signOnePayV1 } from '../src/payments/adapters';
import { IngestionWorker } from '../src/payments/ingestion.worker';
import {
  API,
  PASSWORD,
  bearer,
  createTestApp,
  login,
  prismaOf,
  registerMerchant,
  sleep,
  uniqueEmail,
  waitFor,
} from './helpers';

class FakePushSender implements PushSender {
  readonly enabled = true;
  readonly sent: PushMessage[] = [];
  invalid = new Set<string>();
  async send(m: PushMessage) {
    this.sent.push(m);
    return { sent: m.tokens.length, invalidTokens: m.tokens.filter((t) => this.invalid.has(t)) };
  }
}

describe('Payments: connections, webhooks, transactions, realtime, push (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let baseUrl: string;
  const push = new FakePushSender();
  let providers: PaymentProviderDto[];
  let owner: AuthTokens;
  let companyId: string;

  const provider = (code: string) => providers.find((p) => p.code === code)!;

  function payload(over: Record<string, unknown> = {}) {
    return {
      eventId: `evt_${randomUUID()}`,
      type: 'payment.succeeded',
      transactionId: `txn_${randomUUID()}`,
      amount: '12.50',
      currency: 'USD',
      occurredAt: new Date().toISOString(),
      payer: { name: 'Sok Dara', account: '000123456789' },
      ...over,
    };
  }

  function sendWebhook(connectionId: string, secret: string, body: unknown, opts: { ts?: number } = {}) {
    const raw = JSON.stringify(body);
    const ts = opts.ts ?? Math.floor(Date.now() / 1000);
    return request(http)
      .post(`${API}/webhooks/${connectionId}`)
      .set('Content-Type', 'application/json')
      .set('X-OnePay-Timestamp', String(ts))
      .set('X-OnePay-Signature', signOnePayV1(secret, ts, raw))
      .send(raw);
  }

  async function createConnection(tokens: AuthTokens, code: string, extra: Record<string, unknown> = {}) {
    const res = await request(http)
      .post(`${API}/bank-connections`)
      .set('Authorization', bearer(tokens))
      .send({ providerId: provider(code).id, displayName: `${code} account`, currency: 'USD', ...extra })
      .expect(201);
    return res.body as BankConnectionWithSecretDto;
  }

  const findTxn = (tokens: AuthTokens, providerTxnId: string) =>
    waitFor(async () => {
      const res = await request(http)
        .get(`${API}/transactions?search=${encodeURIComponent(providerTxnId)}`)
        .set('Authorization', bearer(tokens));
      return (res.body.items as TransactionDto[] | undefined)?.find((t) => t.providerTxnId === providerTxnId);
    });

  beforeAll(async () => {
    app = await createTestApp({ pushSender: push });
    await app.listen(0);
    http = app.getHttpServer();
    baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    owner = (await registerMerchant(app, 'Pay Shop')).tokens;
    companyId = (await request(http).get(`${API}/auth/me`).set('Authorization', bearer(owner))).body.activeCompanyId;
    providers = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(owner)).expect(200))
      .body;
  });
  afterAll(() => app.close());

  describe('providers & connections', () => {
    it('is honest about which integrations are live', () => {
      expect(provider('ABA').integrationAvailable).toBe(false);
      expect(provider('BAKONG_KHQR').integrationAvailable).toBe(true); // KHQR collection, confirmed via the Bakong Open API
      expect(provider('ONEPAY_WEBHOOK').integrationAvailable).toBe(true);
      expect(provider('DEMO_SIMULATOR')).toMatchObject({ isDemo: true, integrationAvailable: true });
    });

    it('keeps bank connections without a live integration PENDING', async () => {
      const c = await createConnection(owner, 'ABA', {
        accountNumber: '001 234 567 890',
        credentials: { apiKey: 'super-secret-api-key-value' },
      });
      expect(c.status).toBe('PENDING');
      expect(c.lastError).toMatch(/not available yet/);
      expect(c.webhookUrl).toBeNull();
      expect(c.webhookSecret).toBeNull();
      expect(c.accountNumberMasked).toBe('•••• 7890');
      expect(c.hasCredentials).toBe(true);
      expect(JSON.stringify(c)).not.toContain('super-secret-api-key-value');

      const row = await prismaOf(app).bankConnection.findUniqueOrThrow({ where: { id: c.id } });
      expect(row.credentialCiphertext).toMatch(/^v1\.k1\./);
      expect(row.credentialCiphertext).not.toContain('super-secret');
      expect(row.accountNumberMasked).toBe('•••• 7890');
    });

    it('returns the webhook secret once and never again', async () => {
      const c = await createConnection(owner, 'ONEPAY_WEBHOOK');
      expect(c.webhookSecret).toMatch(/^whsec_/);
      expect(c.webhookUrl).toContain(`/api/v1/webhooks/${c.id}`);
      const again = await request(http)
        .get(`${API}/bank-connections/${c.id}`)
        .set('Authorization', bearer(owner))
        .expect(200);
      expect(again.body.webhookSecret).toBeUndefined();
      expect(JSON.stringify(again.body)).not.toContain(c.webhookSecret!);
      const row = await prismaOf(app).bankConnection.findUniqueOrThrow({ where: { id: c.id } });
      expect(row.webhookSecretCiphertext).not.toContain(c.webhookSecret!);
    });

    it('rejects outlets of another company and unknown fields', async () => {
      const other = await registerMerchant(app, 'Other Shop');
      const otherOutlets = await request(http).get(`${API}/outlets`).set('Authorization', bearer(other.tokens));
      await request(http)
        .post(`${API}/bank-connections`)
        .set('Authorization', bearer(owner))
        .send({ providerId: provider('ONEPAY_WEBHOOK').id, displayName: 'x', currency: 'USD', outletId: otherOutlets.body.items[0].id })
        .expect(400);
      await request(http)
        .post(`${API}/bank-connections`)
        .set('Authorization', bearer(owner))
        .send({ providerId: provider('ONEPAY_WEBHOOK').id, displayName: 'x', currency: 'USD', status: 'ACTIVE' })
        .expect(400);
    });
  });

  describe('signed webhook ingestion', () => {
    let conn: BankConnectionWithSecretDto;

    beforeAll(async () => {
      conn = await createConnection(owner, 'ONEPAY_WEBHOOK');
    });

    it('stores a verified payment once, in minor units, and activates the connection', async () => {
      const body = payload();
      const res = await sendWebhook(conn.id, conn.webhookSecret!, body).expect(202);
      expect(res.body).toMatchObject({ status: 'accepted', duplicate: false });

      const txn = await findTxn(owner, body.transactionId);
      expect(txn).toMatchObject({
        amountMinor: 1250,
        currency: 'USD',
        status: 'SUCCESS',
        payerName: 'Sok Dara',
        payerAccountMasked: '•••• 6789',
        isSimulated: false,
        providerCode: 'ONEPAY_WEBHOOK',
      });

      // Replays are acknowledged but never create a second transaction.
      const dup = await sendWebhook(conn.id, conn.webhookSecret!, body).expect(202);
      expect(dup.body.duplicate).toBe(true);
      const prisma = prismaOf(app);
      expect(await prisma.transaction.count({ where: { providerTxnId: body.transactionId } })).toBe(1);

      const c = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
      expect(c.status).toBe('ACTIVE');
      expect(c.lastSyncedAt).not.toBeNull();

      // Full payer account numbers are never persisted.
      const stored = await prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: body.eventId } });
      expect(JSON.stringify(stored.payload)).not.toContain('000123456789');
      const t = await prisma.transaction.findFirstOrThrow({ where: { providerTxnId: body.transactionId } });
      expect(JSON.stringify(t.rawPayload)).not.toContain('000123456789');
    });

    it('rejects bad signatures, replays outside the window, and unknown endpoints', async () => {
      const body = payload();
      await sendWebhook(conn.id, 'whsec_wrong', body).expect(401);
      await sendWebhook(conn.id, conn.webhookSecret!, body, { ts: Math.floor(Date.now() / 1000) - 600 }).expect(401);
      await request(http)
        .post(`${API}/webhooks/${conn.id}`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(body))
        .expect(401);
      await sendWebhook(randomUUID(), conn.webhookSecret!, body).expect(404);
      expect(await prismaOf(app).webhookEvent.count({ where: { providerEventId: body.eventId } })).toBe(0);
    });

    it('rejects invalid payloads with a useful 400', async () => {
      await sendWebhook(conn.id, conn.webhookSecret!, payload({ amount: 12.5 })).expect(400);
      await sendWebhook(conn.id, conn.webhookSecret!, payload({ amount: '1.234' })).expect(400);
      const res = await sendWebhook(conn.id, conn.webhookSecret!, payload({ currency: 'KHR', amount: '4000' })).expect(400);
      expect(res.body.message).toMatch(/does not match the connection currency/);
    });

    it('follows allowed status transitions and ignores stale or conflicting events', async () => {
      const txnId = `txn_${randomUUID()}`;
      await sendWebhook(conn.id, conn.webhookSecret!, payload({ transactionId: txnId, type: 'payment.pending' })).expect(202);
      const pending = await findTxn(owner, txnId);
      expect(pending.status).toBe('PENDING');

      await sendWebhook(conn.id, conn.webhookSecret!, payload({ transactionId: txnId })).expect(202);
      await waitFor(async () => (await findTxn(owner, txnId)).status === 'SUCCESS');

      // Late "pending" must not downgrade a successful payment.
      const stale = payload({ transactionId: txnId, type: 'payment.pending' });
      await sendWebhook(conn.id, conn.webhookSecret!, stale).expect(202);
      const prisma = prismaOf(app);
      const staleEvent = await waitFor(async () => {
        const e = await prisma.webhookEvent.findFirst({ where: { providerEventId: stale.eventId } });
        return e && e.status !== 'RECEIVED' ? e : null;
      });
      expect(staleEvent.status).toBe('IGNORED');

      // An event claiming a different amount for the same transaction is rejected.
      const tampered = payload({ transactionId: txnId, type: 'payment.reversed', amount: '999.00' });
      await sendWebhook(conn.id, conn.webhookSecret!, tampered).expect(202);
      const bad = await waitFor(async () => {
        const e = await prisma.webhookEvent.findFirst({ where: { providerEventId: tampered.eventId } });
        return e && e.status !== 'RECEIVED' ? e : null;
      });
      expect(bad.status).toBe('FAILED');
      expect(bad.lastError).toMatch(/Amount/);

      await sendWebhook(conn.id, conn.webhookSecret!, payload({ transactionId: txnId, type: 'payment.reversed' })).expect(202);
      await waitFor(async () => (await findTxn(owner, txnId)).status === 'REVERSED');
      const t = await findTxn(owner, txnId);
      expect(t.amountMinor).toBe(1250);
    });

    it('rotating the secret invalidates the old one immediately', async () => {
      const c = await createConnection(owner, 'ONEPAY_WEBHOOK');
      const rotated = await request(http)
        .post(`${API}/bank-connections/${c.id}/rotate-webhook-secret`)
        .set('Authorization', bearer(owner))
        .expect(200);
      expect(rotated.body.webhookSecret).not.toBe(c.webhookSecret);
      await sendWebhook(c.id, c.webhookSecret!, payload()).expect(401);
      await sendWebhook(c.id, rotated.body.webhookSecret, payload()).expect(202);
    });

    it('disconnecting stops ingestion and destroys secrets', async () => {
      const c = await createConnection(owner, 'ONEPAY_WEBHOOK', { credentials: { k: 'v' } });
      await request(http).delete(`${API}/bank-connections/${c.id}`).set('Authorization', bearer(owner)).expect(200);
      await sendWebhook(c.id, c.webhookSecret!, payload()).expect(404);
      const row = await prismaOf(app).bankConnection.findUniqueOrThrow({ where: { id: c.id } });
      expect(row).toMatchObject({ status: 'DISCONNECTED', credentialCiphertext: null, webhookSecretCiphertext: null });
    });
  });

  describe('worker reliability', () => {
    it('processes an event exactly once under concurrent delivery and recovers lost messages', async () => {
      const conn = await createConnection(owner, 'ONEPAY_WEBHOOK');
      const prisma = prismaOf(app);
      const worker = app.get(IngestionWorker);
      const body = payload();
      // Simulate a message that never reached the broker: inbox row only, 1 minute old.
      const ev = await prisma.webhookEvent.create({
        data: {
          companyId,
          bankConnectionId: conn.id,
          providerEventId: body.eventId,
          source: 'WEBHOOK',
          payload: body,
          receivedAt: new Date(Date.now() - 60_000),
        },
      });
      await Promise.all([worker.process(ev.id), worker.process(ev.id), worker.process(ev.id)]);
      expect(await prisma.transaction.count({ where: { providerTxnId: body.transactionId } })).toBe(1);
      expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe('PROCESSED');

      const lost = payload();
      const lostEv = await prisma.webhookEvent.create({
        data: {
          companyId,
          bankConnectionId: conn.id,
          providerEventId: lost.eventId,
          source: 'WEBHOOK',
          payload: lost,
          receivedAt: new Date(Date.now() - 60_000),
        },
      });
      expect(await worker.sweep()).toBeGreaterThanOrEqual(1);
      await waitFor(async () => (await prisma.webhookEvent.findUniqueOrThrow({ where: { id: lostEv.id } })).status === 'PROCESSED');
    });
  });

  describe('tenant isolation & outlet restrictions', () => {
    it('never exposes one merchant’s connections or payments to another', async () => {
      const conn = await createConnection(owner, 'ONEPAY_WEBHOOK');
      const body = payload();
      await sendWebhook(conn.id, conn.webhookSecret!, body).expect(202);
      const txn = await findTxn(owner, body.transactionId);

      const other = (await registerMerchant(app, 'Nosy Shop')).tokens;
      await request(http).get(`${API}/bank-connections/${conn.id}`).set('Authorization', bearer(other)).expect(404);
      await request(http).get(`${API}/transactions/${txn.id}`).set('Authorization', bearer(other)).expect(404);
      const list = await request(http).get(`${API}/transactions`).set('Authorization', bearer(other)).expect(200);
      expect(list.body.total).toBe(0);
      await request(http)
        .post(`${API}/bank-connections/${conn.id}/simulate-payment`)
        .set('Authorization', bearer(other))
        .send({ amount: '1.00' })
        .expect(404);

      // Another merchant's secret cannot sign for this connection.
      const otherConn = await createConnection(other, 'ONEPAY_WEBHOOK');
      await sendWebhook(conn.id, otherConn.webhookSecret!, payload()).expect(401);
    });

    it('shows outlet-restricted staff only their outlet’s payments', async () => {
      const outlet = await request(http)
        .post(`${API}/outlets`)
        .set('Authorization', bearer(owner))
        .send({ name: 'Riverside', code: 'RIVER' })
        .expect(201);
      const email = uniqueEmail('rivercashier');
      await request(http)
        .post(`${API}/employees`)
        .set('Authorization', bearer(owner))
        .send({ email, fullName: 'River Cashier', role: 'CASHIER', initialPassword: PASSWORD, outletIds: [outlet.body.id] })
        .expect(201);
      const cashier = await login(app, email);

      const conn = await createConnection(owner, 'ONEPAY_WEBHOOK');
      const atRiver = payload({ outletCode: 'river' });
      const elsewhere = payload();
      await sendWebhook(conn.id, conn.webhookSecret!, atRiver).expect(202);
      await sendWebhook(conn.id, conn.webhookSecret!, elsewhere).expect(202);
      const riverTxn = await findTxn(owner, atRiver.transactionId);
      const otherTxn = await findTxn(owner, elsewhere.transactionId);
      expect(riverTxn.outletId).toBe(outlet.body.id);

      const seen = await request(http).get(`${API}/transactions?pageSize=100`).set('Authorization', bearer(cashier)).expect(200);
      const ids = seen.body.items.map((t: TransactionDto) => t.id);
      expect(ids).toContain(riverTxn.id);
      expect(ids).not.toContain(otherTxn.id);
      expect(seen.body.items.every((t: TransactionDto) => t.outletId === outlet.body.id)).toBe(true);
      await request(http).get(`${API}/transactions/${otherTxn.id}`).set('Authorization', bearer(cashier)).expect(404);
      await request(http).get(`${API}/bank-connections`).set('Authorization', bearer(cashier)).expect(403);
    });
  });

  describe('demo simulator', () => {
    it('creates clearly flagged simulated payments only on demo connections', async () => {
      const demo = await createConnection(owner, 'DEMO_SIMULATOR');
      expect(demo.status).toBe('ACTIVE');
      expect(demo.webhookUrl).toBeNull();
      await request(http)
        .post(`${API}/bank-connections/${demo.id}/simulate-payment`)
        .set('Authorization', bearer(owner))
        .send({ amount: '3.75', payerName: 'Demo Payer' })
        .expect(202);
      const txn = await waitFor(async () =>
        prismaOf(app).transaction.findFirst({ where: { bankConnectionId: demo.id } }),
      );
      expect(txn).toMatchObject({ isSimulated: true, amountMinor: 375n, status: 'SUCCESS', reference: 'DEMO SIMULATION' });

      const real = await createConnection(owner, 'ONEPAY_WEBHOOK');
      await request(http)
        .post(`${API}/bank-connections/${real.id}/simulate-payment`)
        .set('Authorization', bearer(owner))
        .send({ amount: '3.75' })
        .expect(403);
    });
  });

  describe('summary', () => {
    it('totals per currency/status and per Phnom Penh day', async () => {
      const shop = (await registerMerchant(app, 'Summary Shop')).tokens;
      const conn = await createConnection(shop, 'ONEPAY_WEBHOOK');
      const bodies = [
        payload({ amount: '12.50' }),
        payload({ amount: '7.50' }),
        payload({ amount: '5.00', type: 'payment.failed' }),
        payload({ amount: '1.00', type: 'payment.pending' }),
      ];
      for (const b of bodies) await sendWebhook(conn.id, conn.webhookSecret!, b).expect(202);
      await waitFor(async () => {
        const r = await request(http).get(`${API}/transactions`).set('Authorization', bearer(shop));
        return r.body.total === 4;
      });
      const res = await request(http).get(`${API}/transactions/summary`).set('Authorization', bearer(shop)).expect(200);
      expect(res.body.byCurrency).toEqual([
        {
          currency: 'USD',
          successCount: 2,
          successAmountMinor: 2000,
          pendingCount: 1,
          failedCount: 1,
          reversedCount: 0,
          reversedAmountMinor: 0,
        },
      ]);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date());
      expect(res.body.daily).toEqual([{ date: today, currency: 'USD', successCount: 2, successAmountMinor: 2000 }]);

      await request(http)
        .get(`${API}/transactions/summary?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z`)
        .set('Authorization', bearer(shop))
        .expect(400);
    });
  });

  describe('real-time delivery', () => {
    const sockets: Socket[] = [];
    afterAll(() => sockets.forEach((s) => s.disconnect()));

    function connect(token?: string): Socket {
      const s = io(`${baseUrl}/realtime`, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
      sockets.push(s);
      return s;
    }
    const ready = (s: Socket) =>
      new Promise<void>((resolve, reject) => {
        s.once('ready', () => resolve());
        s.once('disconnect', () => reject(new Error('disconnected')));
      });

    it('pushes new payments to authorised dashboards only', async () => {
      const shop = await registerMerchant(app, 'Live Shop');
      const outlet = await request(http)
        .post(`${API}/outlets`)
        .set('Authorization', bearer(shop.tokens))
        .send({ name: 'Kiosk', code: 'KIOSK' })
        .expect(201);
      const email = uniqueEmail('kioskcashier');
      await request(http)
        .post(`${API}/employees`)
        .set('Authorization', bearer(shop.tokens))
        .send({ email, fullName: 'Kiosk Cashier', role: 'CASHIER', initialPassword: PASSWORD, outletIds: [outlet.body.id] })
        .expect(201);
      const cashier = await login(app, email);
      const stranger = (await registerMerchant(app, 'Stranger Shop')).tokens;

      const ownerSock = connect(shop.tokens.accessToken);
      const cashierSock = connect(cashier.accessToken);
      const strangerSock = connect(stranger.accessToken);
      await Promise.all([ready(ownerSock), ready(cashierSock), ready(strangerSock)]);

      const got = { owner: [] as TransactionDto[], cashier: [] as TransactionDto[], stranger: [] as TransactionDto[] };
      ownerSock.on('transaction.created', (t: TransactionDto) => got.owner.push(t));
      cashierSock.on('transaction.created', (t: TransactionDto) => got.cashier.push(t));
      strangerSock.on('transaction.created', (t: TransactionDto) => got.stranger.push(t));

      const conn = await createConnection(shop.tokens, 'ONEPAY_WEBHOOK');
      const main = payload({ amount: '2.00' });
      const kiosk = payload({ amount: '4.00', outletCode: 'KIOSK' });
      await sendWebhook(conn.id, conn.webhookSecret!, main).expect(202);
      await sendWebhook(conn.id, conn.webhookSecret!, kiosk).expect(202);

      await waitFor(async () => got.owner.length === 2);
      await waitFor(async () => got.cashier.length === 1);
      await sleep(300);
      expect(got.owner.map((t) => t.amountMinor).sort()).toEqual([200, 400]);
      expect(got.cashier.map((t) => t.providerTxnId)).toEqual([kiosk.transactionId]);
      expect(got.stranger).toHaveLength(0);
    });

    it('refuses sockets without a valid token', async () => {
      for (const s of [connect(), connect('not-a-jwt')]) {
        await new Promise<void>((resolve) => s.once('disconnect', () => resolve()));
        expect(s.connected).toBe(false);
      }
    });
  });

  describe('push notifications', () => {
    it('sends localized alerts to entitled devices and prunes dead tokens', async () => {
      const shop = await registerMerchant(app, 'Push Shop');
      const goodToken = `fcm-good-${randomUUID()}`;
      const deadToken = `fcm-dead-${randomUUID()}`;
      push.invalid.add(deadToken);
      for (const token of [goodToken, deadToken]) {
        await request(http)
          .put(`${API}/me/push-tokens`)
          .set('Authorization', bearer(shop.tokens))
          .send({ token, platform: 'ANDROID' })
          .expect(204);
      }

      const demo = await createConnection(shop.tokens, 'DEMO_SIMULATOR');
      await request(http)
        .post(`${API}/bank-connections/${demo.id}/simulate-payment`)
        .set('Authorization', bearer(shop.tokens))
        .send({ amount: '12.50', payerName: 'Sok Dara' })
        .expect(202);

      const msg = await waitFor(async () => push.sent.find((m) => m.tokens.includes(goodToken)));
      expect(msg.tokens.sort()).toEqual([deadToken, goodToken].sort());
      expect(msg.title).toMatch(/^\[DEMO\]/);
      expect(msg.body).toContain('បានទទួលប្រាក់'); // registered owners default to Khmer
      expect(msg.body).toContain('Sok Dara');
      expect(msg.data).toMatchObject({ type: 'payment.received', amountMinor: '1250', currency: 'USD', isSimulated: 'true' });

      await waitFor(async () => (await prismaOf(app).pushToken.count({ where: { token: deadToken } })) === 0);
      expect(await prismaOf(app).pushToken.count({ where: { token: goodToken } })).toBe(1);

      // Pending payments do not trigger "money received" alerts.
      const before = push.sent.length;
      await request(http)
        .post(`${API}/bank-connections/${demo.id}/simulate-payment`)
        .set('Authorization', bearer(shop.tokens))
        .send({ amount: '1.00', type: 'payment.pending' })
        .expect(202);
      await waitFor(async () => (await prismaOf(app).transaction.count({ where: { bankConnectionId: demo.id } })) === 2);
      await sleep(300);
      expect(push.sent.slice(before).filter((m) => m.tokens.includes(goodToken))).toHaveLength(0);
    });
  });
});
