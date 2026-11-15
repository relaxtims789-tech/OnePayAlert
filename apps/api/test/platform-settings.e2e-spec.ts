import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { AuthTokens, BillingOverviewDto, PlatformSettingsDto, SettingTestResultDto } from '@onepay/shared';
import request from 'supertest';
import { BakongError, type BakongClient } from '../src/khqr/bakong.client';
import { MailService } from '../src/mail/mail.service';
import { API, PASSWORD, bearer, createTestApp, login, prismaOf, registerMerchant, uniqueEmail } from './helpers';

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Shaped like a Bakong token (a JWT); expires 2027-01-01. */
const TOKEN = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ data: { id: 'e2e' }, iat: 1790000000, exp: 1798761600 })}.c2lnbmF0dXJlLWUyZQ`;

describe('Platform settings in the admin console (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let superAdmin: AuthTokens;
  let superAdminEmail: string;
  let support: AuthTokens;
  let merchant: AuthTokens;
  /** What the stand-in Bakong answers to a check: "not found" (token fine) or a rejection. */
  let bakongAnswer: 'accept' | 'reject' = 'accept';
  const tokensSeen: string[] = [];

  async function staff(role: 'SUPER_ADMIN' | 'SUPPORT') {
    const email = uniqueEmail(role.toLowerCase());
    await prismaOf(app).user.create({
      data: { email, fullName: `MysoftKH ${role}`, passwordHash: await hash(PASSWORD), platformRole: role, locale: 'en' },
    });
    return { email, tokens: await login(app, email) };
  }
  const settings = async (): Promise<PlatformSettingsDto> =>
    (await request(http).get(`${API}/platform/settings`).set('Authorization', bearer(superAdmin)).expect(200)).body as PlatformSettingsDto;
  const setting = (dto: PlatformSettingsDto, key: string) => dto.settings.find((s) => s.key === key)!;
  const put = (key: string, value: string) => request(http).put(`${API}/platform/settings/${key}`).set('Authorization', bearer(superAdmin)).send({ value });
  const test = (key: string) => request(http).post(`${API}/platform/settings/${key}/test`).set('Authorization', bearer(superAdmin)).expect(200);

  beforeAll(async () => {
    app = await createTestApp({
      bakongLive: (token): BakongClient => {
        tokensSeen.push(token);
        return {
          mode: 'live',
          checkMd5: async () => {
            if (bakongAnswer === 'reject') throw new BakongError(`Bakong rejected the API token (HTTP 401) ${token}`, false);
            return null;
          },
          paidAmong: async () => new Set(),
          accountExists: async () => true,
        };
      },
    });
    http = app.getHttpServer();
    await prismaOf(app).platformSetting.deleteMany();
    const sa = await staff('SUPER_ADMIN');
    superAdmin = sa.tokens;
    superAdminEmail = sa.email;
    support = (await staff('SUPPORT')).tokens;
    merchant = (await registerMerchant(app, 'Settings Shop')).tokens;
  });
  afterAll(async () => {
    // Platform-wide: never leave a saved value behind for the other suites.
    await prismaOf(app).platformSetting.deleteMany();
    await app.close();
  });

  it('is for Super Admins only', async () => {
    await request(http).get(`${API}/platform/settings`).expect(401);
    await request(http).get(`${API}/platform/settings`).set('Authorization', bearer(merchant)).expect(403);
    await request(http).get(`${API}/platform/settings`).set('Authorization', bearer(support)).expect(403);
    await request(http).put(`${API}/platform/settings/BAKONG_API_TOKEN`).set('Authorization', bearer(support)).send({ value: TOKEN }).expect(403);
    await put('DATA_ENCRYPTION_KEY', 'x').expect(404);
  });

  it('shows each setting and where it comes from, starting from the environment', async () => {
    const s = await settings();
    expect(s.settings.map((x) => x.key)).toEqual(['BAKONG_API_TOKEN', 'SMTP_URL', 'MAIL_FROM', 'BILLING_PAYMENT_INSTRUCTIONS']);
    expect(setting(s, 'BAKONG_API_TOKEN')).toMatchObject({ secret: true, source: 'unset', value: null, hint: null });
    expect(setting(s, 'BILLING_PAYMENT_INSTRUCTIONS').secret).toBe(false);
    expect(['environment', 'default']).toContain(setting(s, 'BILLING_PAYMENT_INSTRUCTIONS').source);
    expect(setting(s, 'BILLING_PAYMENT_INSTRUCTIONS').value).toBeTruthy();
    expect(s.bakongMode).toBe('simulated');
    expect(s.mailDriver).toBe('log');
  });

  it('saves a Bakong token encrypted, uses it at once without a restart, and never sends it back', async () => {
    const bad = await put('BAKONG_API_TOKEN', 'too short').expect(400);
    expect(bad.body.code).toBe('SETTING_BAKONG_TOKEN_INVALID');

    const s = (await put('BAKONG_API_TOKEN', `  ${TOKEN}\n`).expect(200)).body as PlatformSettingsDto;
    expect(JSON.stringify(s)).not.toContain(TOKEN);
    expect(setting(s, 'BAKONG_API_TOKEN')).toMatchObject({ source: 'console', value: null, hint: `…${TOKEN.slice(-4)}`, updatedBy: superAdminEmail });
    expect(s.bakongMode).toBe('live');
    expect(s.bakongTokenExpiresAt).toBe('2027-01-01T00:00:00.000Z');

    // Merchants see KHQR switch to live Bakong straight away.
    const khqr = await request(http).get(`${API}/khqr/status`).set('Authorization', bearer(merchant)).expect(200);
    expect(khqr.body.mode).toBe('live');

    const row = await prismaOf(app).platformSetting.findUniqueOrThrow({ where: { key: 'BAKONG_API_TOKEN' } });
    expect(row.encrypted).toBe(true);
    expect(row.value).not.toContain(TOKEN.split('.')[1]!);
    const audit = await prismaOf(app).auditLog.findFirstOrThrow({ where: { action: 'platform.setting.updated' }, orderBy: { createdAt: 'desc' } });
    expect(audit.metadata).toEqual({ key: 'BAKONG_API_TOKEN' });
    expect(JSON.stringify(audit)).not.toContain(TOKEN);
  });

  it('tests the Bakong token with Bakong and says whether it was accepted', async () => {
    bakongAnswer = 'accept';
    expect((await test('BAKONG_API_TOKEN')).body as SettingTestResultDto).toEqual({ ok: true, reason: 'OK', detail: null });
    expect(tokensSeen).toContain(TOKEN);

    bakongAnswer = 'reject';
    const no = (await test('BAKONG_API_TOKEN')).body as SettingTestResultDto;
    expect(no).toMatchObject({ ok: false, reason: 'REJECTED' });
    expect(no.detail).not.toContain(TOKEN);
  });

  it('clearing the token goes back to the environment', async () => {
    const s = (await request(http).delete(`${API}/platform/settings/BAKONG_API_TOKEN`).set('Authorization', bearer(superAdmin)).expect(200)).body as PlatformSettingsDto;
    expect(setting(s, 'BAKONG_API_TOKEN').source).toBe('unset');
    expect(s.bakongMode).toBe('simulated');
    expect(((await test('BAKONG_API_TOKEN')).body as SettingTestResultDto).reason).toBe('NOT_SET');
    expect(await prismaOf(app).auditLog.count({ where: { action: 'platform.setting.cleared' } })).toBeGreaterThan(0);
  });

  it('saves the mail server without ever showing its password, and sends a test email to the admin', async () => {
    const bad = await put('SMTP_URL', 'mail.example.com').expect(400);
    expect(bad.body.code).toBe('SETTING_SMTP_URL_INVALID');

    const s = (await put('SMTP_URL', 'smtps://alerts%40shop.kh:S3cret-Mail-Pass@smtp.example.com:465').expect(200)).body as PlatformSettingsDto;
    expect(JSON.stringify(s)).not.toContain('S3cret-Mail-Pass');
    expect(setting(s, 'SMTP_URL').hint).toBe('smtps://alerts@shop.kh@smtp.example.com:465');

    const mail = app.get(MailService);
    expect((await test('SMTP_URL')).body as SettingTestResultDto).toEqual({ ok: true, reason: 'OK', detail: superAdminEmail });
    expect(mail.outbox.some((m) => m.to === superAdminEmail && m.subject === 'One PayAlert test email')).toBe(true);
  });

  it('changes the payment text merchants see on invoices, and clearing restores the default', async () => {
    const text = 'Pay to ABA 000 111 222 (Mysoftkh) and send the receipt to billing@mysoftkh.com.';
    const tooLong = await put('BILLING_PAYMENT_INSTRUCTIONS', 'x'.repeat(1001)).expect(400);
    expect(tooLong.body.code).toBe('SETTING_TEXT_INVALID');
    await put('BILLING_PAYMENT_INSTRUCTIONS', text).expect(200);
    const billing = (await request(http).get(`${API}/billing`).set('Authorization', bearer(merchant)).expect(200)).body as BillingOverviewDto;
    expect(billing.paymentInstructions).toBe(text);

    await request(http).delete(`${API}/platform/settings/BILLING_PAYMENT_INSTRUCTIONS`).set('Authorization', bearer(superAdmin)).expect(200);
    const after = (await request(http).get(`${API}/billing`).set('Authorization', bearer(merchant)).expect(200)).body as BillingOverviewDto;
    expect(after.paymentInstructions).not.toBe(text);
    expect(after.paymentInstructions).toBeTruthy();
  });
});
