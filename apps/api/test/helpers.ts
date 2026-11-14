import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthTokens, RelayNotificationInput, RelayPhoneEnrollment } from '@onepay/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MQTT_BRIDGE, type MqttBridge } from '../src/devices/mqtt.bridge';
import { BAKONG_CLIENT, type BakongClient } from '../src/khqr/bakong.client';
import { PUSH_SENDER, type PushSender } from '../src/notifications/push.sender';
import { signOnePayV1 } from '../src/payments/adapters';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup';

export const API = '/api/v1';
export const PASSWORD = 'Str0ngPassw0rd';

export async function createTestApp(
  opts: { pushSender?: PushSender; mqttBridge?: MqttBridge; bakongClient?: BakongClient } = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.pushSender) builder = builder.overrideProvider(PUSH_SENDER).useValue(opts.pushSender);
  if (opts.mqttBridge) builder = builder.overrideProvider(MQTT_BRIDGE).useValue(opts.mqttBridge);
  if (opts.bakongClient) builder = builder.overrideProvider(BAKONG_CLIENT).useValue(opts.bakongClient);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error'], rawBody: true });
  await configureApp(app);
  await app.init();
  return app;
}

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@test.onepay.local`;
}

/**
 * Registers a merchant through the public API. New merchants start a Starter trial; unless a
 * test is about plan limits, it gets the Enterprise plan so limits do not get in its way.
 */
export async function registerMerchant(
  app: INestApplication,
  companyName: string,
  opts: { plan?: 'STARTER' | 'BUSINESS' | 'ENTERPRISE' } = {},
): Promise<{ email: string; tokens: AuthTokens; companyId: string }> {
  const email = uniqueEmail(companyName.toLowerCase().replace(/\W+/g, ''));
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/register`)
    .send({ fullName: `${companyName} Owner`, email, password: PASSWORD, companyName })
    .expect(201);
  const prisma = prismaOf(app);
  const membership = await prisma.membership.findFirstOrThrow({ where: { user: { email } } });
  const plan = opts.plan ?? 'ENTERPRISE';
  if (plan !== 'STARTER') {
    const p = await prisma.plan.findUniqueOrThrow({ where: { code: plan } });
    await prisma.subscription.updateMany({ where: { companyId: membership.companyId }, data: { planId: p.id } });
  }
  return { email, tokens: res.body as AuthTokens, companyId: membership.companyId };
}

export async function login(
  app: INestApplication,
  email: string,
  password = PASSWORD,
  companyId?: string,
): Promise<AuthTokens> {
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/login`)
    .send({ email, password, ...(companyId ? { companyId } : {}) })
    .expect(200);
  return res.body as AuthTokens;
}

export function prismaOf(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

export const bearer = (t: AuthTokens | string) =>
  `Bearer ${typeof t === 'string' ? t : t.accessToken}`;

/** Polls until `fn` returns a truthy value (async pipelines: queue → worker → DB). */
export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Phone bank alerts: a "Bank alerts on your phone" connection, and a phone set up on it. */
export async function relayConnection(app: INestApplication, tokens: AuthTokens, currency: 'USD' | 'KHR' = 'USD', displayName = `Phone alerts ${currency}`) {
  const http = app.getHttpServer();
  const providers = (await request(http).get(`${API}/payment-providers`).set('Authorization', bearer(tokens)).expect(200)).body as { id: string; code: string }[];
  const provider = providers.find((p) => p.code === 'PHONE_ALERTS')!;
  return (await request(http).post(`${API}/bank-connections`).set('Authorization', bearer(tokens)).send({ providerId: provider.id, displayName, currency }).expect(201))
    .body as { id: string; status: string; currency: string };
}

export async function enrollPhone(app: INestApplication, tokens: AuthTokens, bankConnectionId: string, name = 'Owner phone') {
  return (await request(app.getHttpServer()).post(`${API}/relay/phones`).set('Authorization', bearer(tokens)).send({ bankConnectionId, name }).expect(201))
    .body as RelayPhoneEnrollment;
}

/** Sends a notification the way the Android app does: HMAC-signed with the phone's secret. */
export function relayNotify(
  app: INestApplication,
  phone: { relayId: string; secret: string },
  body: Partial<RelayNotificationInput> & { text: string },
  opts: { timestamp?: number; secret?: string } = {},
) {
  const payload = JSON.stringify({ key: `k-${Date.now()}-${Math.random().toString(36).slice(2)}`, app: 'com.example.bank', postedAt: new Date().toISOString(), ...body });
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  return request(app.getHttpServer())
    .post(`${API}/relay/notifications`)
    .set('Content-Type', 'application/json')
    .set('x-onepay-relay-id', phone.relayId)
    .set('x-onepay-timestamp', String(ts))
    .set('x-onepay-signature', signOnePayV1(opts.secret ?? phone.secret, ts, payload))
    .send(payload);
}
