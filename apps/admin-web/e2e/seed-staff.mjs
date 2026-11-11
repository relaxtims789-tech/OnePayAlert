// Upserts CAM staff accounts in the *_test database for browser tests (test values only).
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

if (!/\/[a-z0-9_]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('seed-staff: refusing to run outside a *_test database');
}
const prisma = new PrismaClient();
const staff = JSON.parse(process.argv[2]);
for (const s of staff) {
  const passwordHash = await hash(s.password);
  await prisma.user.upsert({
    where: { email: s.email },
    update: { passwordHash, platformRole: s.role, status: 'ACTIVE', locale: 'en' },
    create: { email: s.email, fullName: s.name, passwordHash, platformRole: s.role, locale: 'en' },
  });
}
await prisma.$disconnect();
console.log(`seeded ${staff.length} staff`);
