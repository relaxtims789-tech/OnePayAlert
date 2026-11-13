import type { INestApplication } from '@nestjs/common';
import type { AuthTokens, BankConnectionDto, KhqrChargeDto, PaymentProviderDto, TransactionDto } from '@onepay/shared';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { BAKONG_CLIENT, LiveBakongClient, SimulatedBakongClient } from '../src/khqr/bakong.client';
import { KhqrService } from '../src/khqr/khqr.service';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail, waitFor } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BakongKHQR } = require('bakong-khqr');

async function bakongProviderId(http: ReturnType<INestApplication['getHttpServer']>, t: AuthTokens): Promise<string> {
  const providers = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(t)).expect(200)).body as PaymentProviderDto[];
  const p = providers.find((x) => x.code === 'BAKONG_KHQR')!;
  expect(p.integrationAvailable).toBe(true);
  return p.id;
}

async function findTransaction(http: ReturnType<INestApplication['getHttpServer']>, t: AuthTokens, reference: string) {
  return waitFor(async () => {
    const res = await request(http).get(`${API}/transactions?search=${reference}`).set('Authorization', bearer(t));
    return (res.body.items as TransactionDto[] | undefined)?.find((x) => x.reference === reference);
  });
}

describe('Bakong KHQR collection (e2e)', () => {
  describe('with the simulated Bakong (no token: demo / development)', () => {
    let app: INestApplication;
    let http: ReturnType<INestApplication['getHttpServer']>;
    let owner: AuthTokens;
    let providerId: string;
    let connection: BankConnectionDto;
    let riverside: string;

    const charge = (t: AuthTokens, body: Record<string, unknown>) =>
      request(http).post(`${API}/khqr/charges`).set('Authorization', bearer(t)).send({ bankConnectionId: connection.id, ...body });
    const get = (t: AuthTokens, id: string) => request(http).get(`${API}/khqr/charges/${id}`).set('Authorization', bearer(t));

    beforeAll(async () => {
      app = await createTestApp();
      http = app.getHttpServer();
      const shop = await registerMerchant(app, 'KHQR Cafe');
      owner = shop.tokens;
      providerId = await bakongProviderId(http, owner);
      riverside = (await request(http).post(`${API}/outlets`).set('Authorization', bearer(owner)).send({ name: 'Riverside', code: 'RIVER' }).expect(201)).body.id;
    });
    afterAll(() => app.close());

    it('connects a Bakong account by its id and Latin shop name', async () => {
      const bad = await request(http)
        .post(`${API}/bank-connections`)
        .set('Authorization', bearer(owner))
        .send({ providerId, displayName: 'Bakong', currency: 'USD', accountName: 'KHQR Cafe', externalAccountId: 'not an id' })
        .expect(400);
      expect(bad.body.code).toBe('BAKONG_ACCOUNT_INVALID');
      const khmer = await request(http)
        .post(`${API}/bank-connections`)
        .set('Authorization', bearer(owner))
        .send({ providerId, displayName: 'Bakong', currency: 'USD', accountName: 'ហាងកាហ្វេ', externalAccountId: 'khqr_cafe@aclb' })
        .expect(400);
      expect(khmer.body.code).toBe('KHQR_MERCHANT_NAME_INVALID');
      connection = (
        await request(http)
          .post(`${API}/bank-connections`)
          .set('Authorization', bearer(owner))
          .send({ providerId, displayName: 'Bakong USD', currency: 'USD', accountName: 'KHQR Cafe', externalAccountId: 'KHQR_Cafe@ACLB' })
          .expect(201)
      ).body as BankConnectionDto;
      expect(connection).toMatchObject({ status: 'ACTIVE', externalAccountId: 'khqr_cafe@aclb', webhookUrl: null });
      const status = await request(http).get(`${API}/khqr/status`).set('Authorization', bearer(owner)).expect(200);
      expect(status.body).toEqual({ mode: 'simulated' });
    });

    it('creates a valid dynamic KHQR for the amount, readable by the official SDK', async () => {
      const c = (await charge(owner, { amount: '12.50', outletId: riverside }).expect(201)).body as KhqrChargeDto;
      expect(c).toMatchObject({ status: 'PENDING', amountMinor: 1250, currency: 'USD', outletId: riverside, merchantName: 'KHQR Cafe', simulated: true });
      expect(c.reference).toMatch(/^OPA[2-9A-Z]{7}$/);
      expect(new Date(c.expiresAt).getTime() - Date.now()).toBeGreaterThan(290_000);
      expect(BakongKHQR.verify(c.qr).isValid).toBe(true);
      const d = BakongKHQR.decode(c.qr).data;
      expect(d).toMatchObject({ bakongAccountID: 'khqr_cafe@aclb', merchantName: 'KHQR Cafe', transactionAmount: '12.50', billNumber: c.reference, storeLabel: 'Riverside' });
      expect(d.transactionCurrency).toBe('840');
      expect((await charge(owner, { amount: '0' }).expect(400)).body.code).toBe('KHQR_AMOUNT_INVALID');
      await charge(owner, { amount: '1.234' }).expect(400);
    });

    it('records a paid code once, as a demo payment, and alerts like any other payment', async () => {
      const c = (await charge(owner, { amount: '4.75', outletId: riverside }).expect(201)).body as KhqrChargeDto;
      const paid = (await request(http).post(`${API}/khqr/charges/${c.id}/simulate-paid`).set('Authorization', bearer(owner)).expect(200)).body;
      expect(paid).toMatchObject({ status: 'PAID', payerAccount: 'de•••@bkrt' });
      const txn = await findTransaction(http, owner, c.reference);
      expect(txn).toMatchObject({ status: 'SUCCESS', amountMinor: 475, currency: 'USD', isSimulated: true, providerCode: 'BAKONG_KHQR', outletId: riverside });
      // A second report of the same payment changes nothing.
      await app.get(KhqrService).pollOnce();
      expect(await prismaOf(app).transaction.count({ where: { reference: c.reference } })).toBe(1);
      await request(http).post(`${API}/khqr/charges/${c.id}/cancel`).set('Authorization', bearer(owner)).expect(409);
    });

    it('is confirmed by the poller when Bakong reports the payment', async () => {
      const c = (await charge(owner, { amount: '9.00' }).expect(201)).body as KhqrChargeDto;
      const bakong = app.get(BAKONG_CLIENT) as SimulatedBakongClient;
      bakong.markPaid(c.md5, { fromAccountId: 'dara@abaa', toAccountId: 'khqr_cafe@aclb', currency: 'USD', amount: '9', description: null });
      const r = await app.get(KhqrService).pollOnce();
      expect(r.paid).toBe(1);
      expect((await get(owner, c.id).expect(200)).body.status).toBe('PAID');
      await findTransaction(http, owner, c.reference);
    });

    it('holds a payment that does not match for review instead of announcing it', async () => {
      const c = (await charge(owner, { amount: '20.00' }).expect(201)).body as KhqrChargeDto;
      (app.get(BAKONG_CLIENT) as SimulatedBakongClient).markPaid(c.md5, {
        fromAccountId: 'x@abaa',
        toAccountId: 'khqr_cafe@aclb',
        currency: 'USD',
        amount: '2.00',
        description: null,
      });
      await app.get(KhqrService).pollOnce();
      const row = await prismaOf(app).khqrCharge.findUniqueOrThrow({ where: { id: c.id } });
      expect(row.status).toBe('REVIEW');
      expect(row.reviewReason).toBe('amount 2.00 instead of 20.00');
      expect(await prismaOf(app).transaction.count({ where: { reference: c.reference } })).toBe(0);
    });

    it('expires unpaid codes after their grace period, and can be canceled', async () => {
      const old = (await charge(owner, { amount: '1.00' }).expect(201)).body as KhqrChargeDto;
      await prismaOf(app).khqrCharge.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 2 * 60_000) } });
      await app.get(KhqrService).pollOnce();
      expect((await get(owner, old.id).expect(200)).body.status).toBe('EXPIRED');

      const c = (await charge(owner, { amount: '1.00' }).expect(201)).body as KhqrChargeDto;
      expect((await request(http).post(`${API}/khqr/charges/${c.id}/cancel`).set('Authorization', bearer(owner)).expect(200)).body.status).toBe('CANCELED');
    });

    it('lets cashiers collect for their own outlet only; accountants and other companies cannot', async () => {
      const mk = async (role: string, outletIds?: string[]) => {
        const email = uniqueEmail(role.toLowerCase());
        await request(http)
          .post(`${API}/employees`)
          .set('Authorization', bearer(owner))
          .send({ email, fullName: `${role} One`, role, initialPassword: PASSWORD, ...(outletIds ? { outletIds } : {}) })
          .expect(201);
        return login(app, email);
      };
      const cashier = await mk('CASHIER', [riverside]);
      // Cashiers cannot read bank connections, but can see the Bakong accounts they collect into.
      await request(http).get(`${API}/bank-connections`).set('Authorization', bearer(cashier)).expect(403);
      const accounts = (await request(http).get(`${API}/khqr/accounts`).set('Authorization', bearer(cashier)).expect(200)).body;
      expect(accounts).toEqual([expect.objectContaining({ id: connection.id, accountId: 'khqr_cafe@aclb', merchantName: 'KHQR Cafe', currency: 'USD' })]);
      const mine = (await charge(cashier, { amount: '3.00' }).expect(201)).body as KhqrChargeDto;
      expect(mine.outletId).toBe(riverside);
      const main = await prismaOf(app).outlet.findFirstOrThrow({ where: { companyId: (await prismaOf(app).bankConnection.findUniqueOrThrow({ where: { id: connection.id } })).companyId, code: 'MAIN' } });
      await charge(cashier, { amount: '3.00', outletId: main.id }).expect(403);

      const accountant = await mk('ACCOUNTANT');
      await charge(accountant, { amount: '3.00' }).expect(403);

      await request(http).get(`${API}/khqr/accounts`).set('Authorization', bearer(accountant)).expect(403);

      const other = await registerMerchant(app, 'Other KHQR');
      expect((await request(http).get(`${API}/khqr/accounts`).set('Authorization', bearer(other.tokens)).expect(200)).body).toEqual([]);
      await get(other.tokens, mine.id).expect(404);
      await request(http).post(`${API}/khqr/charges`).set('Authorization', bearer(other.tokens)).send({ bankConnectionId: connection.id, amount: '1.00' }).expect(400);
    });
  });

  describe('with the live Bakong API (fake Bakong server over HTTP)', () => {
    let app: INestApplication;
    let http: ReturnType<INestApplication['getHttpServer']>;
    let bakongServer: Server;
    const paid = new Map<string, Record<string, unknown>>();
    const seenTokens = new Set<string>();

    beforeAll(async () => {
      bakongServer = createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          seenTokens.add(String(req.headers.authorization));
          const json = JSON.parse(body || 'null');
          const reply = (o: unknown) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(o));
          };
          if (req.url === '/v1/check_bakong_account') return reply({ responseCode: String(json.accountId).endsWith('@aclb') ? 0 : 1 });
          if (req.url === '/v1/check_transaction_by_md5_list')
            return reply({ responseCode: 0, data: (json as string[]).map((md5) => ({ md5, status: paid.has(md5) ? 'SUCCESS' : 'NOT_FOUND' })) });
          if (req.url === '/v1/check_transaction_by_md5') {
            const d = paid.get(json.md5);
            return reply(d ? { responseCode: 0, data: d } : { responseCode: 1, data: null });
          }
          res.writeHead(404).end();
        });
      });
      await new Promise<void>((r) => bakongServer.listen(0, '127.0.0.1', () => r()));
      const port = (bakongServer.address() as AddressInfo).port;
      app = await createTestApp({ bakongClient: new LiveBakongClient(`http://127.0.0.1:${port}`, 'live-test-token-0123456789') });
      http = app.getHttpServer();
    });
    afterAll(async () => {
      await app.close();
      await new Promise((r) => bakongServer.close(r));
    });

    it('verifies the account, polls Bakong, and records a real (non-demo) payment', async () => {
      const shop = await registerMerchant(app, 'Live KHQR');
      const providerId = await bakongProviderId(http, shop.tokens);
      const unknown = await request(http)
        .post(`${API}/bank-connections`)
        .set('Authorization', bearer(shop.tokens))
        .send({ providerId, displayName: 'Bakong', currency: 'KHR', accountName: 'Live KHQR', externalAccountId: 'ghost@abaa' })
        .expect(400);
      expect(unknown.body.code).toBe('BAKONG_ACCOUNT_NOT_FOUND');
      const conn = (
        await request(http)
          .post(`${API}/bank-connections`)
          .set('Authorization', bearer(shop.tokens))
          .send({ providerId, displayName: 'Bakong KHR', currency: 'KHR', accountName: 'Live KHQR', externalAccountId: 'live_khqr@aclb' })
          .expect(201)
      ).body as BankConnectionDto;
      expect((await request(http).get(`${API}/khqr/status`).set('Authorization', bearer(shop.tokens))).body).toEqual({ mode: 'live' });

      const c = (await request(http).post(`${API}/khqr/charges`).set('Authorization', bearer(shop.tokens)).send({ bankConnectionId: conn.id, amount: '18000' }).expect(201))
        .body as KhqrChargeDto;
      expect(c).toMatchObject({ amountMinor: 1_800_000, currency: 'KHR', simulated: false });
      await request(http).post(`${API}/khqr/charges/${c.id}/simulate-paid`).set('Authorization', bearer(shop.tokens)).expect(403);

      expect((await app.get(KhqrService).pollOnce()).paid).toBe(0);
      paid.set(c.md5, {
        hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9',
        fromAccountId: 'chan_sophea@abaa',
        toAccountId: 'live_khqr@aclb',
        currency: 'KHR',
        amount: 18000,
        description: c.reference,
        acknowledgedDateMs: Date.now(),
      });
      expect((await app.get(KhqrService).pollOnce()).paid).toBe(1);
      expect(seenTokens).toEqual(new Set(['Bearer live-test-token-0123456789']));

      const txn = await findTransaction(http, shop.tokens, c.reference);
      expect(txn).toMatchObject({ status: 'SUCCESS', amountMinor: 1_800_000, currency: 'KHR', isSimulated: false, providerTxnId: expect.stringMatching(/^a1b2/) });
      const event = await prismaOf(app).webhookEvent.findFirstOrThrow({ where: { providerEventId: `khqr_${c.md5}` } });
      expect(event.source).toBe('POLLER');
    });
  });
});
