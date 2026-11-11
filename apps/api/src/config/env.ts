import { z } from 'zod';

/** Key shipped in .env.example for local development. Rejected in demo and production. */
export const DEV_ENCRYPTION_KEY = 'ZGV2LW9ubHktb25lcGF5YWxlcnQta2V5LTMyLWJ5dGU=';

const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64 encoded');

/** Validated runtime configuration. The process refuses to start on invalid config. */
export const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'demo', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  /** Public base URL of this API, used to build webhook URLs shown to merchants. */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4100'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  RABBITMQ_URL: z.string().url().default('amqp://onepay:onepay_dev_password@localhost:5672'),
  /** rabbitmq = production path. inline = process in-process (local dev without a broker). */
  QUEUE_DRIVER: z.enum(['rabbitmq', 'inline']).default('rabbitmq'),
  /** Run the payment-ingestion consumer in this process. */
  WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** AES-256-GCM key for bank credentials and webhook secrets. */
  DATA_ENCRYPTION_KEY: base64Key32,
  DATA_ENCRYPTION_KEY_ID: z.string().regex(/^[a-z0-9]{1,16}$/).default('k1'),
  /** Merchant web app base URL (used in password reset links). */
  WEB_APP_URL: z.string().url().default('http://localhost:3000'),
  /** smtp = real delivery (required in demo/production). log = write to logs + in-memory outbox (dev/test). */
  MAIL_DRIVER: z.enum(['smtp', 'log']).default('log'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('One PayAlert <no-reply@onepayalert.local>'),
  /** Optional: Firebase service account JSON, base64 encoded. Push is disabled when absent. */
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const live = env.APP_ENV === 'production' || env.APP_ENV === 'demo';
  if (env.APP_ENV === 'production' && env.JWT_ACCESS_SECRET.includes('change-me')) {
    throw new Error('Refusing to start in production with a placeholder JWT secret');
  }
  if (live && env.DATA_ENCRYPTION_KEY === DEV_ENCRYPTION_KEY) {
    throw new Error(`Refusing to start in ${env.APP_ENV} with the development encryption key`);
  }
  if (live && (env.MAIL_DRIVER !== 'smtp' || !env.SMTP_URL)) {
    throw new Error(`${env.APP_ENV} requires MAIL_DRIVER=smtp and SMTP_URL`);
  }
  if (env.APP_ENV === 'production' && env.QUEUE_DRIVER !== 'rabbitmq') {
    throw new Error('Production must use QUEUE_DRIVER=rabbitmq');
  }
  return env;
}
