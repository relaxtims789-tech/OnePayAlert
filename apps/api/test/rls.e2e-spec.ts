import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, bearer, createTestApp, prismaOf, registerMerchant } from './helpers';

/**
 * Row-level security, tested at the database: even a query with NO company filter, run through a
 * tenant client, only ever reaches that company's rows.
 */
describe('Postgres row-level security (e2e)', () => {
  let app: INestApplication;
  let a: { companyId: string; outletId: string };
  let b: { companyId: string; outletId: string };

  beforeAll(async () => {
    app = await createTestApp();
    const http = app.getHttpServer();
    const mk = async (name: string) => {
      const shop = await registerMerchant(app, name);
      const outlet = await request(http).post(`${API}/outlets`).set('Authorization', bearer(shop.tokens)).send({ name: `${name} Two`, code: 'TWO' }).expect(201);
      return { companyId: shop.companyId, outletId: outlet.body.id as string };
    };
    a = await mk('Rls Alpha');
    b = await mk('Rls Beta');
  });
  afterAll(() => app.close());

  it('runs the API as a role that cannot bypass row-level security', async () => {
    const [role] = await prismaOf(app).$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('shows a tenant only its own rows, even without a where clause', async () => {
    const tenant = prismaOf(app).forTenant(a.companyId);
    const outlets = await tenant.outlet.findMany();
    expect(outlets.length).toBeGreaterThanOrEqual(2);
    expect(new Set(outlets.map((o) => o.companyId))).toEqual(new Set([a.companyId]));
    expect(await tenant.outlet.findUnique({ where: { id: b.outletId } })).toBeNull();
    expect((await tenant.company.findMany()).map((c) => c.id)).toEqual([a.companyId]);

    const [{ n }] = await tenant.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM outlets WHERE company_id = ${b.companyId}::uuid`;
    expect(n).toBe(0n);
  });

  it('refuses to change or create another tenant’s rows', async () => {
    const tenant = prismaOf(app).forTenant(a.companyId);
    const res = await tenant.outlet.updateMany({ where: { id: b.outletId }, data: { name: 'Hijacked' } });
    expect(res.count).toBe(0);
    await expect(tenant.outlet.create({ data: { companyId: b.companyId, name: 'Planted', code: 'PLANT' } })).rejects.toThrow(/row-level security/);
    expect((await prismaOf(app).outlet.findUniqueOrThrow({ where: { id: b.outletId } })).name).toBe('Rls Beta Two');
  });

  it('leaves system work (no company context) unaffected', async () => {
    const both = await prismaOf(app).outlet.findMany({ where: { id: { in: [a.outletId, b.outletId] } } });
    expect(both).toHaveLength(2);
  });
});
