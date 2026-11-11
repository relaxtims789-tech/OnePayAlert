import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail } from './helpers';

const NEW_PASSWORD = 'N3wStr0ngPassw0rd';

describe('Account self-service (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let mail: MailService;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    mail = app.get(MailService);
  });
  afterAll(() => app.close());

  const resetLinkFor = (email: string) => {
    const m = [...mail.outbox].reverse().find((x) => x.to === email);
    const token = m && /reset-password\?token=([^\s"&]+)/.exec(m.text)?.[1];
    return token ? decodeURIComponent(token) : null;
  };

  it('updates profile name, phone and language', async () => {
    const { tokens } = await registerMerchant(app, 'Profile Shop');
    const res = await request(http)
      .patch(`${API}/auth/me`)
      .set('Authorization', bearer(tokens))
      .send({ fullName: 'Chan Sophea', phone: '+85512000111', locale: 'zh' })
      .expect(200);
    expect(res.body).toMatchObject({ fullName: 'Chan Sophea', phone: '+85512000111', locale: 'zh' });
    await request(http).patch(`${API}/auth/me`).set('Authorization', bearer(tokens)).send({ locale: 'fr' }).expect(400);
    await request(http).patch(`${API}/auth/me`).set('Authorization', bearer(tokens)).send({ email: 'x@y.z' }).expect(400);
  });

  it('changes password, keeps this session and signs out the others', async () => {
    const { email, tokens } = await registerMerchant(app, 'Change Shop');
    const other = await login(app, email);

    await request(http)
      .post(`${API}/auth/change-password`)
      .set('Authorization', bearer(tokens))
      .send({ currentPassword: 'Wr0ngPassword1', newPassword: NEW_PASSWORD })
      .expect(400);
    await request(http)
      .post(`${API}/auth/change-password`)
      .set('Authorization', bearer(tokens))
      .send({ currentPassword: PASSWORD, newPassword: 'weak' })
      .expect(400);
    await request(http)
      .post(`${API}/auth/change-password`)
      .set('Authorization', bearer(tokens))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);

    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(tokens)).expect(200);
    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(other)).expect(401);
    await request(http).post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(401);
    await login(app, email, NEW_PASSWORD);
  });

  it('resets a forgotten password with a single-use, emailed link', async () => {
    const { email, tokens } = await registerMerchant(app, 'Forgot Shop');

    const res = await request(http).post(`${API}/auth/forgot-password`).send({ email }).expect(202);
    expect(res.body).toEqual({ status: 'accepted' });
    const token = resetLinkFor(email);
    expect(token).toBeTruthy();
    const sent = [...mail.outbox].reverse().find((x) => x.to === email)!;
    expect(sent.subject).toContain('One PayAlert'); // owner registered with default Khmer locale
    expect(sent.html).toContain('#0759B8');

    // Only a hash of the token is stored.
    const user = await prismaOf(app).user.findUniqueOrThrow({ where: { email } });
    const stored = await prismaOf(app).passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toContain(token!);

    await request(http)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: NEW_PASSWORD })
      .expect(204);
    // All sessions are signed out, the old password stops working, the link cannot be reused.
    await request(http).get(`${API}/auth/me`).set('Authorization', bearer(tokens)).expect(401);
    await request(http).post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(401);
    await login(app, email, NEW_PASSWORD);
    await request(http)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: 'An0therPassw0rd' })
      .expect(400);
  });

  it('does not reveal whether an email exists and invalidates older links', async () => {
    const unknown = uniqueEmail('ghost');
    await request(http).post(`${API}/auth/forgot-password`).send({ email: unknown }).expect(202);
    expect(mail.outbox.some((m) => m.to === unknown)).toBe(false);

    const { email } = await registerMerchant(app, 'Two Links Shop');
    await request(http).post(`${API}/auth/forgot-password`).send({ email }).expect(202);
    const first = resetLinkFor(email)!;
    await request(http).post(`${API}/auth/forgot-password`).send({ email }).expect(202);
    const second = resetLinkFor(email)!;
    expect(second).not.toBe(first);
    await request(http).post(`${API}/auth/reset-password`).send({ token: first, newPassword: NEW_PASSWORD }).expect(400);
    await request(http).post(`${API}/auth/reset-password`).send({ token: second, newPassword: NEW_PASSWORD }).expect(204);
  });

  it('rejects expired reset links', async () => {
    const { email } = await registerMerchant(app, 'Expired Shop');
    await request(http).post(`${API}/auth/forgot-password`).send({ email }).expect(202);
    const token = resetLinkFor(email)!;
    const user = await prismaOf(app).user.findUniqueOrThrow({ where: { email } });
    await prismaOf(app).passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(http).post(`${API}/auth/reset-password`).send({ token, newPassword: NEW_PASSWORD }).expect(400);
  });
});
