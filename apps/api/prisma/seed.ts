/**
 * Seeds reference data (payment providers, plans) and, outside production, a MysoftKH super admin.
 * Idempotent: safe to run repeatedly.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ProviderSeed = {
  code: string;
  name: string;
  type: 'BANK' | 'WALLET' | 'GATEWAY';
  /** null = no live integration yet (requires the institution's API access agreement). */
  adapterKey: string | null;
  isDemo?: boolean;
};

const PROVIDERS: ProviderSeed[] = [
  { code: 'BAKONG_KHQR', name: 'Bakong KHQR', type: 'GATEWAY', adapterKey: null },
  { code: 'ABA', name: 'ABA Bank', type: 'BANK', adapterKey: null },
  { code: 'ACLEDA', name: 'ACLEDA Bank', type: 'BANK', adapterKey: null },
  { code: 'WING', name: 'Wing Bank', type: 'WALLET', adapterKey: null },
  { code: 'CANADIA', name: 'Canadia Bank', type: 'BANK', adapterKey: null },
  { code: 'PRINCE', name: 'Prince Bank', type: 'BANK', adapterKey: null },
  // Standard signed webhook for payment gateways / middleware that integrate with One PayAlert.
  { code: 'ONEPAY_WEBHOOK', name: 'Signed Webhook (Gateway / Partner)', type: 'GATEWAY', adapterKey: 'ONEPAY_WEBHOOK_V1' },
];

/** Demo-only simulator; never seeded into production. */
const DEMO_PROVIDER: ProviderSeed = {
  code: 'DEMO_SIMULATOR',
  name: 'Demo Payment Simulator',
  type: 'GATEWAY',
  adapterKey: 'SIMULATOR',
  isDemo: true,
};

const PLANS = [
  { code: 'STARTER', name: 'Starter', priceMinor: 900n, maxOutlets: 1, maxEmployees: 3, maxBankConns: 2, maxDevices: 1 },
  { code: 'BUSINESS', name: 'Business', priceMinor: 2900n, maxOutlets: 5, maxEmployees: 20, maxBankConns: 10, maxDevices: 10 },
  { code: 'ENTERPRISE', name: 'Enterprise', priceMinor: 9900n, maxOutlets: 100, maxEmployees: 500, maxBankConns: 100, maxDevices: 200 },
];

async function main(): Promise<void> {
  const env = process.env.APP_ENV ?? 'development';
  const providers = env === 'production' ? PROVIDERS : [...PROVIDERS, DEMO_PROVIDER];
  for (const p of providers) {
    const data = { name: p.name, type: p.type, adapterKey: p.adapterKey, isDemo: p.isDemo ?? false };
    await prisma.paymentProvider.upsert({
      where: { code: p.code },
      update: data,
      create: { code: p.code, ...data },
    });
  }
  if (env === 'production') {
    // Defence in depth: a demo provider must never be active in production.
    await prisma.paymentProvider.updateMany({ where: { isDemo: true }, data: { isActive: false } });
  }
  for (const plan of PLANS) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: plan, create: plan });
  }

  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (env !== 'production' && email && password) {
    await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: {},
      create: {
        email: email.toLowerCase(),
        fullName: 'MysoftKH Super Admin',
        passwordHash: await hash(password),
        platformRole: 'SUPER_ADMIN',
        locale: 'en',
      },
    });
    console.log(`Super admin ready: ${email}`);
  }
  console.log(`Seeded ${providers.length} providers and ${PLANS.length} plans (APP_ENV=${env}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
