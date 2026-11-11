import { DEV_ENCRYPTION_KEY, validateEnv } from './env';

const realKey = Buffer.alloc(32, 7).toString('base64');
const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  DATA_ENCRYPTION_KEY: DEV_ENCRYPTION_KEY,
};
const prod = { ...base, APP_ENV: 'production', DATA_ENCRYPTION_KEY: realKey };

describe('validateEnv', () => {
  it('applies defaults and parses CORS origins', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.APP_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.QUEUE_DRIVER).toBe('rabbitmq');
    expect(env.WORKER_ENABLED).toBe(true);
  });

  it('rejects short secrets, bad keys and missing database url', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...base, DATA_ENCRYPTION_KEY: 'abc' })).toThrow(/DATA_ENCRYPTION_KEY/);
    const { DATABASE_URL: _omit, ...noDb } = base;
    expect(() => validateEnv(noDb)).toThrow(/DATABASE_URL/);
  });

  it('refuses development secrets and the inline queue in production', () => {
    expect(validateEnv(prod).APP_ENV).toBe('production');
    expect(() =>
      validateEnv({ ...prod, JWT_ACCESS_SECRET: 'change-me-dev-access-secret-at-least-32-chars' }),
    ).toThrow(/placeholder/);
    expect(() => validateEnv({ ...prod, DATA_ENCRYPTION_KEY: DEV_ENCRYPTION_KEY })).toThrow(/encryption key/);
    expect(() => validateEnv({ ...base, APP_ENV: 'demo' })).toThrow(/encryption key/);
    expect(() => validateEnv({ ...prod, QUEUE_DRIVER: 'inline' })).toThrow(/rabbitmq/);
  });
});
