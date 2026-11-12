/**
 * Creates (or resets) a MysoftKH staff account. Works in every environment, including production,
 * where the seed never creates accounts.
 *
 *   STAFF_PASSWORD='<at least 12 characters>' npx ts-node prisma/create-staff.ts <email> "<Full name>" [SUPER_ADMIN|SUPPORT]
 *
 * The password comes from the environment, never the command line (shell history, process list).
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const [email, fullName, role = 'SUPER_ADMIN'] = process.argv.slice(2);
  const password = process.env.STAFF_PASSWORD ?? '';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !fullName) {
    throw new Error('Usage: STAFF_PASSWORD=... npx ts-node prisma/create-staff.ts <email> "<Full name>" [SUPER_ADMIN|SUPPORT]');
  }
  if (role !== 'SUPER_ADMIN' && role !== 'SUPPORT') throw new Error('Role must be SUPER_ADMIN or SUPPORT');
  if (password.length < 12) throw new Error('STAFF_PASSWORD must be at least 12 characters');

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: { passwordHash: await hash(password), platformRole: role, status: 'ACTIVE', fullName },
      create: { email: email.toLowerCase(), fullName, passwordHash: await hash(password), platformRole: role, locale: 'en' },
    });
    // Any existing sessions of this account end: the password just changed.
    await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    console.log(`Staff account ready: ${user.email} (${role})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
