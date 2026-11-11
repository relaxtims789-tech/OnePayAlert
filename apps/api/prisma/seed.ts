/**
 * Seeds reference data (payment providers, plans) and, outside production, a CAM super admin.
 * Idempotent: safe to run repeatedly.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROVIDERS = [
  { code: 'BAKONG_KHQR', name: 'Bakong KHQR', type: 'GATEWAY' },
  { code: 'ABA', name: 'ABA Bank', type: 'BANK' },
  { code: 'ACLEDA', name: 'ACLEDA Bank', type: 'BANK' },
  { code: 'WING', name: 'Wing Bank', type: 'WALLET' },
  { code: 'CANADIA', name: 'Canadia Bank', type: 'BANK' },
  { code: 'PRINCE', name: 'Prince Bank', type: 'BANK' },
] as const;

const PLANS = [
  { code: 'STARTER', name: 'Starter', priceMinor: 900n, maxOutlets: 1, maxEmployees: 3, maxBankConns: 2, maxDevices: 1 },
  { code: 'BUSINESS', name: 'Business', priceMinor: 2900n, maxOutlets: 5, maxEmployees: 20, maxBankConns: 10, maxDevices: 10 },
  { code: 'ENTERPRISE', name: 'Enterprise', priceMinor: 9900n, maxOutlets: 100, maxEmployees: 500, maxBankConns: 100, maxDevices: 200 },
];

async function main(): Promise<void> {
  for (const p of PROVIDERS) {
    await prisma.paymentProvider.upsert({
      where: { code: p.code },
      update: { name: p.name, type: p.type },
      create: { code: p.code, name: p.name, type: p.type },
    });
  }
  for (const plan of PLANS) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: plan, create: plan });
  }

  const env = process.env.APP_ENV ?? 'development';
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (env !== 'production' && email && password) {
    await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: {},
      create: {
        email: email.toLowerCase(),
        fullName: 'CAM Super Admin',
        passwordHash: await hash(password),
        platformRole: 'SUPER_ADMIN',
        locale: 'en',
      },
    });
    console.log(`Super admin ready: ${email}`);
  }
  console.log(`Seeded ${PROVIDERS.length} providers and ${PLANS.length} plans (APP_ENV=${env}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
