import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthTokens } from '@onepay/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup';

export const API = '/api/v1';
export const PASSWORD = 'Str0ngPassw0rd';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
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
