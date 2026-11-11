import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail } from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
  });
  afterAll(() => app.close());

  it('reports health with the database up', async () => {
    const res = await request(http).get(`${API}/health`).expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up', environment: 'test' });
  });

  it('registers a merchant with owner role, main outlet and trial subscription', async () => {
    const { email, tokens } = await registerMerchant(app, 'Dara Coffee');
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const me = await request(http).get(`${API}/auth/me`).set('Authorization', bearer(tokens)).expect(200);
    expect(me.body.email).toBe(email);
    expect(me.body.activeRole).toBe('OWNER');
    expect(me.body.permissions).toContain('outlet.manage');
    expect(me.body.permissions).not.toContain('platform.companies.read');

    const prisma = prismaOf(app);
    const companyId = me.body.activeCompanyId as string;
    const outlets = await prisma.outlet.findMany({ where: { companyId } });
    expect(outlets.map((o) => o.code)).toEqual(['MAIN']);
    const sub = await prisma.subscription.findFirst({ where: { companyId } });
    expect(sub?.status).toBe('TRIALING');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects duplicate email, weak passwords and unknown fields', async () => {
    const { email } = await registerMerchant(app, 'Dup Shop');
    await request(http)
      .post(`${API}/auth/register`)
      .send({ fullName: 'X Y', email, password: PASSWORD, companyName: 'Other' })
      .expect(409);
    await request(http)
      .post(`${API}/auth/register`)
      .send({ fullName: 'X Y', email: uniqueEmail('weak'), password: 'short', companyName: 'Other' })
      .expect(400);
    await request(http)
      .post(`${API}/auth/register`)
      .send({
        fullName: 'X Y',
        email: uniqueEmail('extra'),
        password: PASSWORD,
        companyName: 'Other',
        platformRole: 'SUPER_ADMIN',
      })
      .expect(400);
  });

  it('logs in with valid credentials only', async () => {
    const { email } = await registerMerchant(app, 'Login Shop');
    await request(http).post(`${API}/auth/login`).send({ email, password: 'Wr0ngPassword' }).expect(401);
    await request(http)
      .post(`${API}/auth/login`)
      .send({ email: uniqueEmail('nobody'), password: PASSWORD })
      .expect(401);
    const tokens = await login(app, email.toUpperCase());
    expect(tokens.accessToken).toBeTruthy();
  });

  it('requires a valid bearer token on protected routes', async () => {
    await request(http).get(`${API}/auth/me`).expect(401);
    await request(http).get(`${API}/outlets`).set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('rotates refresh tokens and revokes every session on reuse', async () => {
    const { tokens } = await registerMerchant(app, 'Rotate Shop');
    const r1 = await request(http)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    expect(r1.body.refreshToken).not.toBe(tokens.refreshToken);

    // The rotated-out session can no longer be used for API calls.
    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(tokens)).expect(401);
    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(r1.body.accessToken)).expect(200);

    // Replaying the old refresh token long after rotation is treated as theft: all sessions die.
    const prisma = prismaOf(app);
    const oldHash = createHash('sha256').update(tokens.refreshToken).digest('hex');
    await prisma.session.update({
      where: { refreshTokenHash: oldHash },
      data: { revokedAt: new Date(Date.now() - 5 * 60_000) },
    });
    await request(http).post(`${API}/auth/refresh`).send({ refreshToken: tokens.refreshToken }).expect(401);
    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(r1.body.accessToken)).expect(401);
    await request(http).post(`${API}/auth/refresh`).send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  it('tolerates a just-rotated refresh token being re-sent (lost response) without signing out', async () => {
    const { tokens } = await registerMerchant(app, 'Flaky Network Shop');
    const first = await request(http).post(`${API}/auth/refresh`).send({ refreshToken: tokens.refreshToken }).expect(200);
    // The client never saw `first` (dropped response) and retries with the old token.
    const retry = await request(http).post(`${API}/auth/refresh`).send({ refreshToken: tokens.refreshToken }).expect(200);
    expect(retry.body.refreshToken).not.toBe(first.body.refreshToken);
    // Both lineages stay valid; nobody was signed out.
    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(first.body.accessToken)).expect(200);
    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(retry.body.accessToken)).expect(200);
    await request(http).post(`${API}/auth/refresh`).send({ refreshToken: retry.body.refreshToken }).expect(200);
  });

  it('does not apply the grace window to tokens revoked by logout', async () => {
    const { tokens } = await registerMerchant(app, 'Logout Grace Shop');
    await request(http).post(`${API}/auth/logout`).send({ refreshToken: tokens.refreshToken }).expect(204);
    await request(http).post(`${API}/auth/refresh`).send({ refreshToken: tokens.refreshToken }).expect(401);
  });

  it('logs out by revoking the refresh token and its session', async () => {
    const { tokens } = await registerMerchant(app, 'Logout Shop');
    await request(http).post(`${API}/auth/logout`).send({ refreshToken: tokens.refreshToken }).expect(204);
    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(tokens)).expect(401);
    await request(http).post(`${API}/auth/refresh`).send({ refreshToken: tokens.refreshToken }).expect(401);
  });

  it('switches between companies the user belongs to', async () => {
    const a = await registerMerchant(app, 'Switch A');
    const b = await registerMerchant(app, 'Switch B');
    // Owner of B adds owner of A as an accountant.
    await request(http)
      .post(`${API}/employees`)
      .set('Authorization', bearer(b.tokens))
      .send({ email: a.email, fullName: 'A Owner', role: 'ACCOUNTANT', initialPassword: PASSWORD })
      .expect(201);

    const meA = await request(http).get(`${API}/auth/me`).set('Authorization', bearer(a.tokens)).expect(200);
    expect(meA.body.memberships).toHaveLength(2);
    const companyB = meA.body.memberships.find((m: { role: string }) => m.role === 'ACCOUNTANT').companyId;

    const switched = await request(http)
      .post(`${API}/auth/switch-company`)
      .set('Authorization', bearer(a.tokens))
      .send({ companyId: companyB })
      .expect(200);
    const meB = await request(http)
      .get(`${API}/auth/me`)
      .set('Authorization', bearer(switched.body.accessToken))
      .expect(200);
    expect(meB.body.activeCompanyId).toBe(companyB);
    expect(meB.body.activeRole).toBe('ACCOUNTANT');
    expect(meB.body.permissions).not.toContain('outlet.manage');

    // Cannot switch into a company without membership.
    const c = await registerMerchant(app, 'Switch C');
    const meC = await request(http).get(`${API}/auth/me`).set('Authorization', bearer(c.tokens)).expect(200);
    await request(http)
      .post(`${API}/auth/switch-company`)
      .set('Authorization', bearer(switched.body.accessToken))
      .send({ companyId: meC.body.activeCompanyId })
      .expect(403);
  });
});
