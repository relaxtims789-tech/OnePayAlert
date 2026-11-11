import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthTokens } from '@onepay/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PUSH_SENDER, type PushSender } from '../src/notifications/push.sender';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup';

export const API = '/api/v1';
export const PASSWORD = 'Str0ngPassw0rd';

export async function createTestApp(opts: { pushSender?: PushSender } = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.pushSender) builder = builder.overrideProvider(PUSH_SENDER).useValue(opts.pushSender);
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

export async function registerMerchant(
  app: INestApplication,
  companyName: string,
): Promise<{ email: string; tokens: AuthTokens }> {
  const email = uniqueEmail(companyName.toLowerCase().replace(/\W+/g, ''));
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/register`)
    .send({ fullName: `${companyName} Owner`, email, password: PASSWORD, companyName })
    .expect(201);
  return { email, tokens: res.body as AuthTokens };
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
