import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { AuthTokens } from '@onepay/shared';
import request from 'supertest';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail } from './helpers';

describe('Tenant isolation & RBAC (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let ownerA: AuthTokens;
  let ownerB: AuthTokens;
  let ownerBEmail: string;
  let companyA: string;
  let companyB: string;
  let outletA: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    ownerA = (await registerMerchant(app, 'Tenant A')).tokens;
    const b = await registerMerchant(app, 'Tenant B');
    ownerB = b.tokens;
    ownerBEmail = b.email;
    companyA = (await request(http).get(`${API}/auth/me`).set('Authorization', bearer(ownerA))).body
      .activeCompanyId;
    companyB = (await request(http).get(`${API}/auth/me`).set('Authorization', bearer(ownerB))).body
      .activeCompanyId;

    const created = await request(http)
      .post(`${API}/outlets`)
      .set('Authorization', bearer(ownerA))
      .send({ name: 'BKK1 Branch', code: 'bkk1', address: 'Street 278, Phnom Penh' })
      .expect(201);
    outletA = created.body.id;
    expect(created.body.code).toBe('BKK1');
    expect(created.body.companyId).toBe(companyA);
  });
  afterAll(() => app.close());

  describe('tenant isolation', () => {
    it('lists only the caller’s own outlets', async () => {
      const resB = await request(http).get(`${API}/outlets`).set('Authorization', bearer(ownerB)).expect(200);
      expect(resB.body.items.every((o: { companyId: string }) => o.companyId === companyB)).toBe(true);
      expect(resB.body.items.map((o: { id: string }) => o.id)).not.toContain(outletA);
    });

    it('returns 404 for another tenant’s outlet on read and update', async () => {
      await request(http).get(`${API}/outlets/${outletA}`).set('Authorization', bearer(ownerB)).expect(404);
      await request(http)
        .patch(`${API}/outlets/${outletA}`)
        .set('Authorization', bearer(ownerB))
        .send({ name: 'Hijacked' })
        .expect(404);
      const prisma = prismaOf(app);
      expect((await prisma.outlet.findUniqueOrThrow({ where: { id: outletA } })).name).toBe('BKK1 Branch');
    });

    it('ignores a client-supplied companyId when creating data', async () => {
      await request(http)
        .post(`${API}/outlets`)
        .set('Authorization', bearer(ownerB))
        .send({ name: 'Sneaky', code: 'SNEAKY', companyId: companyA })
        .expect(400); // forbidNonWhitelisted
    });

    it('enforces outlet code uniqueness per company only', async () => {
      await request(http)
        .post(`${API}/outlets`)
        .set('Authorization', bearer(ownerA))
        .send({ name: 'Duplicate', code: 'BKK1' })
        .expect(409);
      await request(http)
        .post(`${API}/outlets`)
        .set('Authorization', bearer(ownerB))
        .send({ name: 'Same code other tenant', code: 'BKK1' })
        .expect(201);
    });

    it('does not expose another tenant’s employees or company', async () => {
      const employeesB = await request(http).get(`${API}/employees`).set('Authorization', bearer(ownerB));
      expect(employeesB.body.items).toHaveLength(1);
      const membershipA = await prismaOf(app).membership.findFirstOrThrow({ where: { companyId: companyA } });
      await request(http)
        .get(`${API}/employees/${membershipA.id}`)
        .set('Authorization', bearer(ownerB))
        .expect(404);
      const company = await request(http)
        .get(`${API}/companies/current`)
        .set('Authorization', bearer(ownerB))
        .expect(200);
      expect(company.body.id).toBe(companyB);
    });
  });

  describe('role-based permissions', () => {
    let cashier: AuthTokens;
    let cashierMembership: string;
    let admin: AuthTokens;
    let adminMembership: string;

    beforeAll(async () => {
      const cashierEmail = uniqueEmail('cashier');
      const c = await request(http)
        .post(`${API}/employees`)
        .set('Authorization', bearer(ownerA))
        .send({
          email: cashierEmail,
          fullName: 'Cashier One',
          role: 'CASHIER',
          initialPassword: PASSWORD,
          outletIds: [outletA],
        })
        .expect(201);
      cashierMembership = c.body.membershipId;
      expect(c.body.outletIds).toEqual([outletA]);
      cashier = await login(app, cashierEmail);

      const adminEmail = uniqueEmail('admin');
      const a = await request(http)
        .post(`${API}/employees`)
        .set('Authorization', bearer(ownerA))
        .send({ email: adminEmail, fullName: 'Admin One', role: 'ADMIN', initialPassword: PASSWORD })
        .expect(201);
      adminMembership = a.body.membershipId;
      admin = await login(app, adminEmail);
    });

    it('limits a cashier to read-only access of assigned outlets', async () => {
      const list = await request(http).get(`${API}/outlets`).set('Authorization', bearer(cashier)).expect(200);
      expect(list.body.items.map((o: { id: string }) => o.id)).toEqual([outletA]);
      await request(http)
        .post(`${API}/outlets`)
        .set('Authorization', bearer(cashier))
        .send({ name: 'Nope', code: 'NOPE' })
        .expect(403);
      await request(http).get(`${API}/employees`).set('Authorization', bearer(cashier)).expect(403);
      await request(http)
        .patch(`${API}/companies/current`)
        .set('Authorization', bearer(cashier))
        .send({ name: 'Renamed' })
        .expect(403);
    });

    it('rejects outlets from another company when assigning access', async () => {
      const outletsB = await request(http).get(`${API}/outlets`).set('Authorization', bearer(ownerB));
      await request(http)
        .patch(`${API}/employees/${cashierMembership}`)
        .set('Authorization', bearer(ownerA))
        .send({ outletIds: [outletsB.body.items[0].id] })
        .expect(400);
    });

    it('prevents admins from escalating privileges or touching the owner', async () => {
      await request(http)
        .post(`${API}/employees`)
        .set('Authorization', bearer(admin))
        .send({ email: uniqueEmail('x'), fullName: 'Another Admin', role: 'ADMIN', initialPassword: PASSWORD })
        .expect(403);
      const ownerMembership = await prismaOf(app).membership.findFirstOrThrow({
        where: { companyId: companyA, role: 'OWNER' },
      });
      await request(http)
        .patch(`${API}/employees/${ownerMembership.id}`)
        .set('Authorization', bearer(admin))
        .send({ isActive: false })
        .expect(403);
      await request(http)
        .patch(`${API}/employees/${adminMembership}`)
        .set('Authorization', bearer(admin))
        .send({ role: 'CASHIER' })
        .expect(403);
      // Admin may promote a cashier to manager.
      const r = await request(http)
        .patch(`${API}/employees/${cashierMembership}`)
        .set('Authorization', bearer(admin))
        .send({ role: 'MANAGER' })
        .expect(200);
      expect(r.body.role).toBe('MANAGER');
    });

    it('immediately cuts off a deactivated employee', async () => {
      const email = uniqueEmail('leaver');
      const created = await request(http)
        .post(`${API}/employees`)
        .set('Authorization', bearer(ownerA))
        .send({ email, fullName: 'Leaver', role: 'CASHIER', initialPassword: PASSWORD })
        .expect(201);
      const leaver = await login(app, email);
      await request(http).get(`${API}/outlets`).set('Authorization', bearer(leaver)).expect(200);

      await request(http)
        .patch(`${API}/employees/${created.body.membershipId}`)
        .set('Authorization', bearer(ownerA))
        .send({ isActive: false })
        .expect(200);
      await request(http).get(`${API}/outlets`).set('Authorization', bearer(leaver)).expect(401);
      await request(http).post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(403);
    });

    it('records an audit trail for tenant changes', async () => {
      const res = await request(http)
        .get(`${API}/companies/current/audit-logs`)
        .set('Authorization', bearer(ownerA))
        .expect(200);
      const actions = res.body.items.map((l: { action: string }) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['company.registered', 'outlet.created', 'employee.added', 'employee.updated']));
      expect(res.body.items.every((l: { companyId: string }) => l.companyId === companyA)).toBe(true);
      await request(http)
        .get(`${API}/companies/current/audit-logs`)
        .set('Authorization', bearer(cashier))
        .expect(403);
    });
  });

  describe('MysoftKH super admin', () => {
    let superAdmin: AuthTokens;

    beforeAll(async () => {
      const email = uniqueEmail('superadmin');
      await prismaOf(app).user.create({
        data: { email, fullName: 'MysoftKH Admin', passwordHash: await hash(PASSWORD), platformRole: 'SUPER_ADMIN' },
      });
      superAdmin = await login(app, email);
    });

    it('blocks merchants from platform endpoints', async () => {
      await request(http).get(`${API}/platform/companies`).set('Authorization', bearer(ownerA)).expect(403);
    });

    it('has no tenant access without a membership', async () => {
      await request(http).get(`${API}/outlets`).set('Authorization', bearer(superAdmin)).expect(403);
    });

    it('lists companies and suspends a merchant, cutting off its users', async () => {
      const list = await request(http)
        .get(`${API}/platform/companies?search=Tenant`)
        .set('Authorization', bearer(superAdmin))
        .expect(200);
      expect(list.body.items.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([companyA, companyB]));

      await request(http)
        .patch(`${API}/platform/companies/${companyB}/status`)
        .set('Authorization', bearer(superAdmin))
        .send({ status: 'SUSPENDED' })
        .expect(200);
      await request(http).get(`${API}/outlets`).set('Authorization', bearer(ownerB)).expect(403);
      await request(http).post(`${API}/auth/login`).send({ email: ownerBEmail, password: PASSWORD }).expect(403);

      await request(http)
        .patch(`${API}/platform/companies/${companyB}/status`)
        .set('Authorization', bearer(superAdmin))
        .send({ status: 'ACTIVE' })
        .expect(200);
      await request(http).get(`${API}/outlets`).set('Authorization', bearer(ownerB)).expect(200);
    });
  });
});
