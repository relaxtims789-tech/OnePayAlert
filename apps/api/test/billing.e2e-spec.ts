import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { AuthTokens, BillingOverviewDto, InvoiceDto, PaymentProviderDto } from '@onepay/shared';
import request from 'supertest';
import { BillingService } from '../src/billing/billing.service';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail } from './helpers';

const DAY = 86_400_000;

describe('Plans, limits and billing (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let superAdmin: AuthTokens;
  let demoProviderId: string;

  const overview = async (t: AuthTokens) =>
    (await request(http).get(`${API}/billing`).set('Authorization', bearer(t)).expect(200)).body as BillingOverviewDto;
  const addOutlet = (t: AuthTokens, code: string, lang?: string) => {
    const r = request(http).post(`${API}/outlets`).set('Authorization', bearer(t));
    if (lang) r.set('Accept-Language', lang);
    return r.send({ name: `Outlet ${code}`, code });
  };
  const addConnection = (t: AuthTokens, name: string) =>
    request(http)
      .post(`${API}/bank-connections`)
      .set('Authorization', bearer(t))
      .send({ providerId: demoProviderId, displayName: name, currency: 'USD' });
  const addEmployee = (t: AuthTokens, role = 'CASHIER') =>
    request(http)
      .post(`${API}/employees`)
      .set('Authorization', bearer(t))
      .send({ email: uniqueEmail('staff'), fullName: 'Staff Member', role, initialPassword: PASSWORD });
  const subscriptionOf = (companyId: string) =>
    prismaOf(app).subscription.findFirstOrThrow({ where: { companyId }, include: { plan: true } });

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    const email = uniqueEmail('billing.admin');
    await prismaOf(app).user.create({
      data: { email, fullName: 'MysoftKH Billing', passwordHash: await hash(PASSWORD), platformRole: 'SUPER_ADMIN', locale: 'en' },
    });
    superAdmin = await login(app, email);
    const shop = await registerMerchant(app, 'Provider Lookup');
    const providers = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(shop.tokens)).expect(200))
      .body as PaymentProviderDto[];
    demoProviderId = (providers.find((p) => p.code === 'DEMO_SIMULATOR') as PaymentProviderDto).id;
  });
  afterAll(() => app.close());

  describe('plan limits', () => {
    it('starts every new merchant on a 14-day Starter trial and reports usage against it', async () => {
      const { tokens } = await registerMerchant(app, 'Trial Shop', { plan: 'STARTER' });
      const o = await overview(tokens);
      expect(o.subscription).toMatchObject({ status: 'TRIALING', plan: { code: 'STARTER' } });
      const trialDays = (new Date(o.subscription!.trialEndsAt!).getTime() - Date.now()) / DAY;
      expect(trialDays).toBeGreaterThan(13.9);
      expect(trialDays).toBeLessThanOrEqual(14);
      expect(o.canAddResources).toBe(true);
      expect(o.usage).toEqual({
        outlets: { used: 1, limit: 1 },
        employees: { used: 0, limit: 3 },
        bankConnections: { used: 0, limit: 2 },
        devices: { used: 0, limit: 1 },
      });
      expect(o.plans.map((p) => p.code)).toEqual(expect.arrayContaining(['STARTER', 'BUSINESS', 'ENTERPRISE']));
      expect(o.paymentInstructions).toBeTruthy();
    });

    it('refuses outlets beyond the plan, in the caller’s language, and frees the slot on deactivation', async () => {
      const { tokens, companyId } = await registerMerchant(app, 'Outlet Limit', { plan: 'STARTER' });
      const km = await addOutlet(tokens, 'TWO', 'km-KH,km;q=0.9,en;q=0.5').expect(403);
      expect(km.body.code).toBe('PLAN_LIMIT_OUTLETS');
      expect(km.body.message).toBe('គម្រោង Starter របស់អ្នកអនុញ្ញាតសាខាសកម្មបានច្រើនបំផុត 1។ សូមដំឡើងគម្រោង ដើម្បីបន្ថែមទៀត។');
      const en = await addOutlet(tokens, 'TWO').expect(403);
      expect(en.body.message).toBe('Your Starter plan allows up to 1 active outlets. Upgrade your plan to add more.');

      const main = await prismaOf(app).outlet.findFirstOrThrow({ where: { companyId, code: 'MAIN' } });
      await request(http).patch(`${API}/outlets/${main.id}`).set('Authorization', bearer(tokens)).send({ isActive: false }).expect(200);
      await addOutlet(tokens, 'TWO').expect(201);
      // Re-activating MAIN would make two active outlets.
      const again = await request(http).patch(`${API}/outlets/${main.id}`).set('Authorization', bearer(tokens)).send({ isActive: true });
      expect(again.status).toBe(403);
      expect(again.body.code).toBe('PLAN_LIMIT_OUTLETS');
    });

    it('never lets parallel requests take the same last slot', async () => {
      const { tokens, companyId } = await registerMerchant(app, 'Race Shop', { plan: 'STARTER' });
      await prismaOf(app).outlet.updateMany({ where: { companyId }, data: { isActive: false } });
      const results = await Promise.all(['R1', 'R2', 'R3', 'R4', 'R5'].map((c) => addOutlet(tokens, c)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 403)).toHaveLength(4);
      expect(await prismaOf(app).outlet.count({ where: { companyId, isActive: true } })).toBe(1);
    });

    it('limits bank connections; disconnecting frees a slot', async () => {
      const { tokens } = await registerMerchant(app, 'Conn Limit', { plan: 'STARTER' });
      const first = (await addConnection(tokens, 'One').expect(201)).body as { id: string };
      await addConnection(tokens, 'Two').expect(201);
      expect((await addConnection(tokens, 'Three').expect(403)).body.code).toBe('PLAN_LIMIT_BANK_CONNECTIONS');
      await request(http).delete(`${API}/bank-connections/${first.id}`).set('Authorization', bearer(tokens)).expect(200);
      await addConnection(tokens, 'Three').expect(201);
    });

    it('counts staff but not the owner toward the employee limit', async () => {
      const { tokens } = await registerMerchant(app, 'Staff Limit', { plan: 'STARTER' });
      for (let i = 0; i < 3; i++) await addEmployee(tokens).expect(201);
      expect((await addEmployee(tokens).expect(403)).body.code).toBe('PLAN_LIMIT_EMPLOYEES');
      expect((await overview(tokens)).usage.employees).toEqual({ used: 3, limit: 3 });
    });
  });

  describe('lifecycle and invoices', () => {
    it('expires a finished trial: nothing new can be added, but payments keep arriving', async () => {
      const { tokens, companyId } = await registerMerchant(app, 'Lapsed Trial', { plan: 'STARTER' });
      const conn = (await addConnection(tokens, 'Counter').expect(201)).body as { id: string };
      await prismaOf(app).subscription.updateMany({ where: { companyId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
      await app.get(BillingService).runLifecycle();
      expect((await subscriptionOf(companyId)).status).toBe('EXPIRED');

      const blocked = await addConnection(tokens, 'Second').set('Accept-Language', 'zh-CN').expect(403);
      expect(blocked.body).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE', message: expect.stringContaining('订阅已结束') });
      expect((await overview(tokens)).canAddResources).toBe(false);
      // Alerts are the service merchants rely on: never cut off by billing.
      await request(http)
        .post(`${API}/bank-connections/${conn.id}/simulate-payment`)
        .set('Authorization', bearer(tokens))
        .send({ amount: '1.00' })
        .expect(202);
    });

    it('turns a plan choice into an invoice; only MysoftKH confirming payment activates it', async () => {
      const { tokens, companyId } = await registerMerchant(app, 'Upgrade Shop', { plan: 'STARTER' });
      const plans = (await overview(tokens)).plans;
      const business = plans.find((p) => p.code === 'BUSINESS')!;
      const enterprise = plans.find((p) => p.code === 'ENTERPRISE')!;

      const inv = (await request(http).post(`${API}/billing/checkout`).set('Authorization', bearer(tokens)).send({ planId: business.id }).expect(200))
        .body as InvoiceDto;
      expect(inv).toMatchObject({ kind: 'NEW', status: 'OPEN', amountMinor: 2900, currency: 'USD', plan: { code: 'BUSINESS' } });
      expect(inv.number).toMatch(/^INV-\d{4}-\d{6}$/);
      // Asking again returns the same invoice rather than billing twice.
      const same = await request(http).post(`${API}/billing/checkout`).set('Authorization', bearer(tokens)).send({ planId: business.id }).expect(200);
      expect(same.body.id).toBe(inv.id);
      // Still on the trial plan until paid.
      expect((await subscriptionOf(companyId)).plan.code).toBe('STARTER');
      await addOutlet(tokens, 'TWO').expect(403);

      // Changing their mind voids the first invoice.
      const ent = (await request(http).post(`${API}/billing/checkout`).set('Authorization', bearer(tokens)).send({ planId: enterprise.id }).expect(200))
        .body as InvoiceDto;
      expect((await prismaOf(app).invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('VOID');
      expect(ent.amountMinor).toBe(9900);

      // Merchants cannot confirm their own payment.
      await request(http)
        .post(`${API}/platform/invoices/${ent.id}/mark-paid`)
        .set('Authorization', bearer(tokens))
        .send({ paymentMethod: 'BANK_TRANSFER' })
        .expect(403);

      const paid = await request(http)
        .post(`${API}/platform/invoices/${ent.id}/mark-paid`)
        .set('Authorization', bearer(superAdmin))
        .send({ paymentMethod: 'BANK_TRANSFER', paymentReference: 'ABA-778812' })
        .expect(200);
      expect(paid.body).toMatchObject({ status: 'PAID', paymentMethod: 'BANK_TRANSFER', paymentReference: 'ABA-778812' });
      const sub = await subscriptionOf(companyId);
      expect(sub).toMatchObject({ status: 'ACTIVE', plan: { code: 'ENTERPRISE' } });
      const months = (sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()) / DAY;
      expect(months).toBeGreaterThanOrEqual(28);
      expect(months).toBeLessThanOrEqual(31);
      await addOutlet(tokens, 'TWO').expect(201);

      // Paying twice is impossible.
      const twice = await request(http)
        .post(`${API}/platform/invoices/${ent.id}/mark-paid`)
        .set('Authorization', bearer(superAdmin))
        .send({ paymentMethod: 'CASH' })
        .expect(409);
      expect(twice.body.code).toBe('INVOICE_NOT_OPEN');

      const list = await request(http).get(`${API}/billing/invoices`).set('Authorization', bearer(tokens)).expect(200);
      expect(list.body.items.map((i: InvoiceDto) => i.status)).toEqual(['PAID', 'VOID']);
      const audit = await prismaOf(app).auditLog.findFirst({ where: { companyId, action: 'platform.invoice.paid' } });
      expect(audit?.metadata).toMatchObject({ reference: 'ABA-778812', method: 'BANK_TRANSFER' });
    });

    it('keeps billing with the owner: admins can see it but not choose plans', async () => {
      const { tokens } = await registerMerchant(app, 'Admin Billing');
      const adminEmail = uniqueEmail('admin');
      await request(http)
        .post(`${API}/employees`)
        .set('Authorization', bearer(tokens))
        .send({ email: adminEmail, fullName: 'Shop Admin', role: 'ADMIN', initialPassword: PASSWORD })
        .expect(201);
      const admin = await login(app, adminEmail);
      const o = await overview(admin);
      await request(http).post(`${API}/billing/checkout`).set('Authorization', bearer(admin)).send({ planId: o.plans[0]!.id }).expect(403);
    });

    it('invoices renewals ahead of time, then runs PAST_DUE → EXPIRED; late payment continues the period', async () => {
      const { tokens, companyId } = await registerMerchant(app, 'Renewal Shop', { plan: 'STARTER' });
      const billing = app.get(BillingService);
      const business = (await overview(tokens)).plans.find((p) => p.code === 'BUSINESS')!;
      const inv = (await request(http).post(`${API}/billing/checkout`).set('Authorization', bearer(tokens)).send({ planId: business.id }).expect(200))
        .body as InvoiceDto;
      await request(http)
        .post(`${API}/platform/invoices/${inv.id}/mark-paid`)
        .set('Authorization', bearer(superAdmin))
        .send({ paymentMethod: 'BANK_TRANSFER' })
        .expect(200);

      // Period ends in 3 days → a renewal invoice is issued once, due at the period end.
      const periodEnd = new Date(Date.now() + 3 * DAY);
      await prismaOf(app).subscription.updateMany({ where: { companyId }, data: { currentPeriodEnd: periodEnd } });
      await billing.runLifecycle();
      await billing.runLifecycle();
      const open = await prismaOf(app).invoice.findMany({ where: { companyId, status: 'OPEN' } });
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ kind: 'RENEWAL', amountMinor: 2900n });
      expect(open[0]!.dueAt.getTime()).toBe(periodEnd.getTime());

      // Period over, unpaid → PAST_DUE (still usable), then EXPIRED after the grace period.
      const ended = new Date(Date.now() - DAY);
      await prismaOf(app).subscription.updateMany({ where: { companyId }, data: { currentPeriodEnd: ended } });
      await billing.runLifecycle();
      expect((await subscriptionOf(companyId)).status).toBe('PAST_DUE');
      expect((await overview(tokens)).canAddResources).toBe(true);
      await prismaOf(app).subscription.updateMany({ where: { companyId }, data: { currentPeriodEnd: new Date(Date.now() - 8 * DAY) } });
      await billing.runLifecycle();
      expect((await subscriptionOf(companyId)).status).toBe('EXPIRED');

      // Back within the grace period, paying the renewal continues from the old period end.
      await prismaOf(app).subscription.updateMany({ where: { companyId }, data: { status: 'PAST_DUE', currentPeriodEnd: ended } });
      await request(http)
        .post(`${API}/platform/invoices/${open[0]!.id}/mark-paid`)
        .set('Authorization', bearer(superAdmin))
        .send({ paymentMethod: 'CASH' })
        .expect(200);
      const sub = await subscriptionOf(companyId);
      expect(sub.status).toBe('ACTIVE');
      expect(sub.currentPeriodStart.getTime()).toBe(ended.getTime());
    });

    it('lets MysoftKH void an unpaid invoice and list invoices across merchants', async () => {
      const { tokens, companyId } = await registerMerchant(app, 'Void Shop', { plan: 'STARTER' });
      const business = (await overview(tokens)).plans.find((p) => p.code === 'BUSINESS')!;
      const inv = (await request(http).post(`${API}/billing/checkout`).set('Authorization', bearer(tokens)).send({ planId: business.id }).expect(200))
        .body as InvoiceDto;
      const all = await request(http)
        .get(`${API}/platform/invoices?status=OPEN&companyId=${companyId}`)
        .set('Authorization', bearer(superAdmin))
        .expect(200);
      expect(all.body.items).toEqual([expect.objectContaining({ id: inv.id, companyName: 'Void Shop' })]);
      await request(http).post(`${API}/platform/invoices/${inv.id}/void`).set('Authorization', bearer(superAdmin)).expect(200);
      expect((await overview(tokens)).openInvoice).toBeNull();
      await request(http)
        .post(`${API}/platform/invoices/${inv.id}/mark-paid`)
        .set('Authorization', bearer(superAdmin))
        .send({ paymentMethod: 'CASH' })
        .expect(409);
    });
  });
});
