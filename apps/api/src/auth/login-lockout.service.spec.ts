import { HttpException } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.service';
import type { RedisService } from '../infra/redis.service';
import { LoginLockoutService } from './login-lockout.service';

/** Just enough of ioredis for the lockout: values with expiry, in memory. */
function memoryRedis() {
  const store = new Map<string, { value: number; expiresAt: number | null }>();
  const live = (k: string) => {
    const e = store.get(k);
    if (e && e.expiresAt !== null && e.expiresAt <= Date.now()) store.delete(k);
    return store.get(k);
  };
  const client = {
    async incr(k: string) {
      const e = live(k) ?? { value: 0, expiresAt: null };
      e.value += 1;
      store.set(k, e);
      return e.value;
    },
    async pexpire(k: string, ms: number) {
      const e = live(k);
      if (e) e.expiresAt = Date.now() + ms;
      return e ? 1 : 0;
    },
    async pttl(k: string) {
      const e = live(k);
      if (!e) return -2;
      return e.expiresAt === null ? -1 : e.expiresAt - Date.now();
    },
    async del(...keys: string[]) {
      keys.forEach((k) => store.delete(k));
      return keys.length;
    },
    multi() {
      const ops: (() => Promise<unknown>)[] = [];
      const chain = {
        set: (k: string, _v: string, _px: 'PX', ms: number) => {
          ops.push(async () => store.set(k, { value: 1, expiresAt: Date.now() + ms }));
          return chain;
        },
        del: (k: string) => {
          ops.push(() => client.del(k));
          return chain;
        },
        exec: async () => Promise.all(ops.map((op) => op())),
      };
      return chain;
    },
  };
  return client;
}

const config = { get: (k: string) => ({ APP_ENV: 'test', LOGIN_MAX_FAILURES: 3, LOGIN_LOCK_MINUTES: 10 })[k] } as unknown as AppConfig;

describe('LoginLockoutService', () => {
  it('locks after the configured number of failures, per email, case-insensitively', async () => {
    const svc = new LoginLockoutService({ client: memoryRedis() } as unknown as RedisService, config);
    expect(await svc.recordFailure('Shop@Example.com')).toBe(false);
    expect(await svc.recordFailure('shop@example.com')).toBe(false);
    await expect(svc.assertNotLocked('shop@example.com')).resolves.toBeUndefined();
    expect(await svc.recordFailure('SHOP@example.com')).toBe(true);

    const err = await svc.assertNotLocked('shop@example.com').catch((e: HttpException) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({ code: 'ACCOUNT_LOCKED', message: expect.stringContaining('10 min') });
    await expect(svc.assertNotLocked('other@example.com')).resolves.toBeUndefined();

    await svc.clear('shop@example.com');
    await expect(svc.assertNotLocked('shop@example.com')).resolves.toBeUndefined();
  });

  it('never blocks sign-in when Redis is down', async () => {
    const down = new Proxy({}, { get: () => () => Promise.reject(new Error('ECONNREFUSED')) });
    const svc = new LoginLockoutService({ client: down } as unknown as RedisService, config);
    await expect(svc.assertNotLocked('shop@example.com')).resolves.toBeUndefined();
    await expect(svc.recordFailure('shop@example.com')).resolves.toBe(false);
    await expect(svc.clear('shop@example.com')).resolves.toBeUndefined();
  });
});
