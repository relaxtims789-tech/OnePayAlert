import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type {
  AuthTokens,
  BankConnectionWithSecretDto,
  PaymentProviderDto,
  PlanDto,
  PlatformCompanyDetailDto,
} from '@onepay/shared';
import request from 'supertest';
import { IngestionWorker } from '../src/payments/ingestion.worker';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail, waitFor } from './helpers';

describe('Platform / CAM Super Admin (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let superAdmin: AuthTokens;
  let support: AuthTokens;
  let merchant: AuthTokens;
  let merchantEmail: string;
  let companyId: string;

  async function staff(role: 'SUPER_ADMIN' | 'SUPPORT') {
    const email = uniqueEmail(role.toLowerCase());
    await prismaOf(app).user.create({
      data: { email, fullName: `CAM ${role}`, passwordHash: await hash(PASSWORD), platformRole: role, locale: 'en' },
    });
    return login(app, email);
  }

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    superAdmin = await staff('SUPER_ADMIN');
    support = await staff('SUPPORT');
    const m = await registerMerchant(app, 'Platform Shop');
    merchant = m.tokens;
    merchantEmail = m.email;
    companyId = (await request(http).get(`${API}/auth/me`).set('Authorization', bearer(merchant))).body.activeCompanyId;
  });
  afterAll(() => app.close());

  it('keeps every platform endpoint closed to merchants', async () => {
    for (const path of ['overview', 'companies', `companies/${companyId}`, 'plans', 'audit-logs', 'health']) {
      await request(http).get(`${API}/platform/${path}`).set('Authorization', bearer(merchant)).expect(403);
    }
    await request(http).get(`${API}/platform/overview`).expect(401);
  });

  it('lets support staff read but not change anything', async () => {
    await request(http).get(`${API}/platform/overview`).set('Authorization', bearer(support)).expect(200);
    const providers = await request(http).get(`${API}/platform/payment-providers`).set('Authorization', bearer(support)).expect(200);
    await request(http)
      .patch(`${API}/platform/payment-providers/${providers.body[0].id}`)
      .set('Authorization', bearer(support))
      .send({ isActive: false })
      .expect(403);
    await request(http).get(`${API}/platform/companies/${companyId}`).set('Authorization', bearer(support)).expect(200);
    await request(http)
      .patch(`${API}/platform/companies/${companyId}/status`)
      .set('Authorization', bearer(support))
      .send({ status: 'SUSPENDED' })
      .expect(403);
    await request(http)
      .post(`${API}/platform/plans`)
      .set('Authorization', bearer(support))
      .send({ code: 'NOPE', name: 'Nope', priceMinor: 1, currency: 'USD', interval: 'MONTH', maxOutlets: 1, maxEmployees: 1, maxBankConns: 1, maxDevices: 1 })
      .expect(403);
  });

  it('reports platform KPIs that separate real from simulated money', async () => {
    const providers: PaymentProviderDto[] = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(merchant))).body;
    const demo = providers.find((p) => p.code === 'DEMO_SIMULATOR')!;
    const conn = (
      await request(http)
        .post(`${API}/bank-connections`)
        .set('Authorization', bearer(merchant))
        .send({ providerId: demo.id, displayName: 'Demo', currency: 'USD' })
        .expect(201)
    ).body as BankConnectionWithSecretDto;
    const before = (await request(http).get(`${API}/platform/overview`).set('Authorization', bearer(superAdmin))).body;
    await request(http)
      .post(`${API}/bank-connections/${conn.id}/simulate-payment`)
      .set('Authorization', bearer(merchant))
      .send({ amount: '9.99' })
      .expect(202);
    const after = await waitFor(async () => {
      const r = (await request(http).get(`${API}/platform/overview`).set('Authorization', bearer(superAdmin))).body;
      return r.simulatedPaymentsToday > before.simulatedPaymentsToday ? r : null;
    });
    // Simulated money never shows up as real platform volume.
    expect(after.paymentsToday).toEqual(before.paymentsToday);
    expect(after.merchants.total).toBeGreaterThanOrEqual(1);
    expect(after.merchants.byStatus.ACTIVE).toBeGreaterThanOrEqual(1);
    expect(after.recentMerchants.map((c: { id: string }) => c.id)).toContain(companyId);
    expect(after.signupsDaily.length).toBeGreaterThanOrEqual(1);
  });

  it('shows merchant detail without leaking secrets', async () => {
    const providers: PaymentProviderDto[] = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(merchant))).body;
    await request(http)
      .post(`${API}/bank-connections`)
      .set('Authorization', bearer(merchant))
      .send({
        providerId: providers.find((p) => p.code === 'ONEPAY_WEBHOOK')!.id,
        displayName: 'Gateway',
        currency: 'USD',
        credentials: { apiKey: 'top-secret-credential-value' },
      })
      .expect(201);

    const res = await request(http).get(`${API}/platform/companies/${companyId}`).set('Authorization', bearer(superAdmin)).expect(200);
    const d = res.body as PlatformCompanyDetailDto;
    expect(d.ownerEmail).toBe(merchantEmail);
    expect(d.members.map((m) => m.role)).toContain('OWNER');
    expect(d.outlets.map((o) => o.code)).toContain('MAIN');
    expect(d.subscription?.status).toBe('TRIALING');
    expect(d.subscription?.plan.code).toBe('STARTER');
    expect(d.connections.length).toBeGreaterThanOrEqual(2);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('top-secret');
    expect(raw).not.toMatch(/ciphertext|passwordHash|whsec_/i);

    await request(http).get(`${API}/platform/companies/00000000-0000-4000-8000-000000000000`).set('Authorization', bearer(superAdmin)).expect(404);
  });

  it('searches merchants by owner email and filters by status', async () => {
    const r = await request(http).get(`${API}/platform/companies`).query({ search: merchantEmail }).set('Authorization', bearer(superAdmin)).expect(200);
    expect(r.body.items.map((c: { id: string }) => c.id)).toEqual([companyId]);
    const suspended = await request(http).get(`${API}/platform/companies?status=SUSPENDED&pageSize=100`).set('Authorization', bearer(superAdmin)).expect(200);
    expect(suspended.body.items.every((c: { status: string }) => c.status === 'SUSPENDED')).toBe(true);
  });

  it('suspends with a reason, cuts the merchant off, and records it in the platform audit log', async () => {
    await request(http)
      .patch(`${API}/platform/companies/${companyId}/status`)
      .set('Authorization', bearer(superAdmin))
      .send({ status: 'SUSPENDED', reason: 'KYC documents expired' })
      .expect(200);
    await request(http).get(`${API}/outlets`).set('Authorization', bearer(merchant)).expect(403);

    const logs = await request(http)
      .get(`${API}/platform/audit-logs`)
      .query({ companyId, action: 'platform.' })
      .set('Authorization', bearer(superAdmin))
      .expect(200);
    const entry = logs.body.items.find((l: { action: string }) => l.action === 'platform.company.status_changed');
    expect(entry.metadata).toMatchObject({ from: 'ACTIVE', to: 'SUSPENDED', reason: 'KYC documents expired' });
    expect(entry.actorEmail).toMatch(/super_admin/);
    expect(entry.companyName).toBe('Platform Shop');

    await request(http)
      .patch(`${API}/platform/companies/${companyId}/status`)
      .set('Authorization', bearer(superAdmin))
      .send({ status: 'ACTIVE' })
      .expect(200);
    await request(http).get(`${API}/outlets`).set('Authorization', bearer(merchant)).expect(200);
  });

  it('manages plans in integer minor units and moves a merchant to a new plan', async () => {
    const code = `GROWTH_${Date.now()}`.slice(0, 40);
    const created = await request(http)
      .post(`${API}/platform/plans`)
      .set('Authorization', bearer(superAdmin))
      .send({ code, name: 'Growth', priceMinor: 1900, currency: 'USD', interval: 'MONTH', maxOutlets: 3, maxEmployees: 10, maxBankConns: 5, maxDevices: 5 })
      .expect(201);
    const plan = created.body as PlanDto;
    expect(plan.priceMinor).toBe(1900);

    await request(http)
      .post(`${API}/platform/plans`)
      .set('Authorization', bearer(superAdmin))
      .send({ code, name: 'Dup', priceMinor: 1, currency: 'USD', interval: 'MONTH', maxOutlets: 1, maxEmployees: 1, maxBankConns: 1, maxDevices: 1 })
      .expect(409);
    await request(http)
      .post(`${API}/platform/plans`)
      .set('Authorization', bearer(superAdmin))
      .send({ code: 'FLOAT', name: 'Float', priceMinor: 19.5, currency: 'USD', interval: 'MONTH', maxOutlets: 1, maxEmployees: 1, maxBankConns: 1, maxDevices: 1 })
      .expect(400);

    const updated = await request(http).patch(`${API}/platform/plans/${plan.id}`).set('Authorization', bearer(superAdmin)).send({ priceMinor: 2400 }).expect(200);
    expect(updated.body.priceMinor).toBe(2400);

    const periodEnd = new Date(Date.now() + 60 * 86_400_000).toISOString();
    const sub = await request(http)
      .patch(`${API}/platform/companies/${companyId}/subscription`)
      .set('Authorization', bearer(superAdmin))
      .send({ planId: plan.id, status: 'ACTIVE', currentPeriodEnd: periodEnd })
      .expect(200);
    expect(sub.body).toMatchObject({ status: 'ACTIVE', plan: { code, priceMinor: 2400 } });
    expect(sub.body.currentPeriodEnd).toBe(periodEnd);

    const plans = (await request(http).get(`${API}/platform/plans`).set('Authorization', bearer(superAdmin))).body as PlanDto[];
    expect(plans.find((p) => p.id === plan.id)?.subscriberCount).toBe(1);
  });

  it('shows ingestion failures in health and re-queues them', async () => {
    const prisma = prismaOf(app);
    const providers: PaymentProviderDto[] = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(merchant))).body;
    const conn = (
      await request(http)
        .post(`${API}/bank-connections`)
        .set('Authorization', bearer(merchant))
        .send({ providerId: providers.find((p) => p.code === 'ONEPAY_WEBHOOK')!.id, displayName: 'Retry gateway', currency: 'USD' })
        .expect(201)
    ).body as BankConnectionWithSecretDto;
    const payload = {
      eventId: `evt_retry_${Date.now()}`,
      type: 'payment.succeeded',
      transactionId: `txn_retry_${Date.now()}`,
      amount: '3.00',
      currency: 'USD',
      occurredAt: new Date().toISOString(),
    };
    const ev = await prisma.webhookEvent.create({
      data: { companyId, bankConnectionId: conn.id, providerEventId: payload.eventId, source: 'WEBHOOK', payload, status: 'FAILED', attempts: 5, lastError: 'simulated outage' },
    });

    const health = await request(http).get(`${API}/platform/health`).set('Authorization', bearer(support)).expect(200);
    expect(health.body).toMatchObject({ database: 'up', redis: 'up', queue: 'up' });
    expect(health.body.recentFailures.map((f: { id: string }) => f.id)).toContain(ev.id);
    expect(health.body.webhookEvents.failedLast24h).toBeGreaterThanOrEqual(1);

    await request(http).post(`${API}/platform/webhook-events/${ev.id}/retry`).set('Authorization', bearer(support)).expect(403);
    await request(http).post(`${API}/platform/webhook-events/${ev.id}/retry`).set('Authorization', bearer(superAdmin)).expect(202);
    await waitFor(async () => (await prisma.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })).status === 'PROCESSED');
    expect(await prisma.transaction.count({ where: { providerTxnId: payload.transactionId } })).toBe(1);
    // Retrying something that is not FAILED is refused.
    await request(http).post(`${API}/platform/webhook-events/${ev.id}/retry`).set('Authorization', bearer(superAdmin)).expect(400);
    expect(app.get(IngestionWorker)).toBeDefined();
  });
});
