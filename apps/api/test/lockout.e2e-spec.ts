import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { RedisService } from '../src/infra/redis.service';
import { MailService } from '../src/mail/mail.service';
import { API, PASSWORD, createTestApp, login, prismaOf, registerMerchant, uniqueEmail } from './helpers';

const WRONG = 'Wr0ngPassw0rd';
const NEW_PASSWORD = 'N3wStr0ngPassw0rd';

describe('Sign-in lockout per account (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let mail: MailService;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    mail = app.get(MailService);
  });
  afterAll(() => app.close());

  const attempt = (email: string, password: string, lang = 'en') =>
    request(http).post(`${API}/auth/login`).set('Accept-Language', lang).send({ email, password });

  /** Four wrong passwords are answered normally; the fifth (default limit) locks the account. */
  async function lock(email: string) {
    for (let i = 0; i < 4; i++) {
      const r = await attempt(email, WRONG).expect(401);
      expect(r.body.code).toBe('INVALID_CREDENTIALS');
    }
    return attempt(email, WRONG).expect(429);
  }

  const lockKey = (email: string) =>
    `onepay:test:login:lock:${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 40)}`;

  it('locks an account after 5 wrong passwords, refusing even the right one, and tells the owner', async () => {
    const { email } = await registerMerchant(app, 'Lockout Shop');
    const locked = await lock(email);
    expect(locked.body).toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 429 });
    expect(locked.body.message).toContain('locked for 15 min');

    // The right password does not help while locked, in any case of the email, in the user's language.
    const km = await attempt(email.toUpperCase(), PASSWORD, 'km').expect(429);
    expect(km.body.message).toContain('ចាក់សោ');

    const notice = [...mail.outbox].reverse().find((m) => m.to === email);
    expect(notice?.subject).toBe('គណនី One PayAlert របស់អ្នកត្រូវបានចាក់សោ'); // in the owner's language (Khmer by default)
    expect(notice?.text).toContain('/forgot-password');

    const user = await prismaOf(app).user.findUniqueOrThrow({ where: { email } });
    expect(await prismaOf(app).auditLog.count({ where: { action: 'auth.locked', entityId: user.id } })).toBe(1);

    // Other accounts are unaffected.
    const other = await registerMerchant(app, 'Neighbour Shop');
    expect((await login(app, other.email)).accessToken).toBeTruthy();
  });

  it('treats unknown emails exactly like real ones, so a lock reveals nothing', async () => {
    const nobody = uniqueEmail('nobody');
    const locked = await lock(nobody);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    await attempt(nobody, PASSWORD).expect(429);
    expect(mail.outbox.some((m) => m.to === nobody)).toBe(false);
  });

  it('a successful sign-in resets the count', async () => {
    const { email } = await registerMerchant(app, 'Typo Shop');
    for (let i = 0; i < 4; i++) await attempt(email, WRONG).expect(401);
    await login(app, email);
    for (let i = 0; i < 4; i++) await attempt(email, WRONG).expect(401);
    await login(app, email);
  });

  it('unlocks when the lock expires', async () => {
    const { email } = await registerMerchant(app, 'Patient Shop');
    await lock(email);
    await app.get(RedisService).client.pexpire(lockKey(email), 1);
    await new Promise((r) => setTimeout(r, 20));
    expect((await login(app, email)).accessToken).toBeTruthy();
  });

  it('resetting the password unlocks the account at once', async () => {
    const { email } = await registerMerchant(app, 'Forgetful Shop');
    await lock(email);
    await request(http).post(`${API}/auth/forgot-password`).send({ email }).expect(202);
    const sent = [...mail.outbox].reverse().find((m) => m.to === email && /reset-password\?token=/.test(m.text))!;
    const token = decodeURIComponent(/reset-password\?token=([^\s"&]+)/.exec(sent.text)![1]!);
    await request(http).post(`${API}/auth/reset-password`).send({ token, newPassword: NEW_PASSWORD }).expect(204);
    expect((await login(app, email, NEW_PASSWORD)).accessToken).toBeTruthy();
  });
});
