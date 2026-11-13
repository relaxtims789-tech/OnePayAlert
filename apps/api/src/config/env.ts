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
  /** Shown to merchants with every open invoice: how to pay MysoftKH (bank account, KHQR...). */
  BILLING_PAYMENT_INSTRUCTIONS: z
    .string()
    .default('Pay by bank transfer to Mysoftkh and quote the invoice number. Our team confirms payments within one business day.'),
  /**
   * Soundbox broker (EMQX). Without MQTT_URL, devices can still be registered and claimed but no
   * announcements are sent. The API connects as MQTT_USERNAME (a superuser in the auth hook).
   */
  MQTT_URL: z.string().url().optional(),
  MQTT_USERNAME: z.string().min(3).default('onepay-api'),
  MQTT_PASSWORD: z.string().min(16).optional(),
  /** Shared secret EMQX sends to the auth/ACL hooks. Hooks deny everything when it is unset. */
  MQTT_HOOK_SECRET: z.string().min(24).optional(),
  /** `json` (one JSON object per line, for log collectors) or `pretty`. Default: json in demo/production. */
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  /** Enables GET /api/v1/metrics (Prometheus), protected by `Authorization: Bearer <token>`. */
  METRICS_TOKEN: z.string().min(24).optional(),
  /**
   * Reverse proxies in front of the API (0 = none). Needed for the real client IP in audit logs and
   * rate limits: with a proxy and 0, every user would share the proxy's address and one rate limit.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * Bakong Open API (KHQR). The token comes from the NBC developer portal (renew it before it
   * expires). Without it, demo/development simulate Bakong and production cannot collect KHQR.
   */
  BAKONG_API_URL: z.string().url().default('https://api-bakong.nbc.gov.kh'),
  BAKONG_API_TOKEN: z.string().min(20).optional(),
  /** How often pending KHQR payments are checked with Bakong (ms). 0 disables (tests poll directly). */
  KHQR_POLL_INTERVAL_MS: z.coerce.number().int().min(0).default(3000),
  /** How often trials, renewals and grace periods are checked. 0 disables the job (tests run it directly). */
  BILLING_JOB_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(900),
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
  // An empty variable means "not set" (Docker Compose passes unset optional values as "").
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => !(typeof v === 'string' && v.trim() === '')));
  const parsed = envSchema.safeParse(cleaned);
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
  if (env.APP_ENV === 'test' && !/\/[a-z0-9_]*_test(\?|$)/.test(env.DATABASE_URL)) {
    throw new Error('APP_ENV=test must use a *_test database (refusing to touch dev/demo/production data)');
  }
  if (env.MQTT_URL && (!env.MQTT_PASSWORD || !env.MQTT_HOOK_SECRET)) {
    throw new Error('MQTT_URL requires MQTT_PASSWORD and MQTT_HOOK_SECRET');
  }
  if (env.APP_ENV === 'production' && env.QUEUE_DRIVER !== 'rabbitmq') {
    throw new Error('Production must use QUEUE_DRIVER=rabbitmq');
  }
  return env;
}
