// Creates (or updates) the database role the API runs as, so row-level security applies to it.
//
//   MIGRATION_DATABASE_URL  owner / admin connection (runs migrations, owns the tables)
//   DATABASE_URL            the runtime connection; its user and password become the app role
//
// The app role is a plain login role: not superuser, cannot bypass RLS, cannot create objects;
// it may only read and write rows. Safe to run repeatedly. If both URLs use the same user
// (local development), there is nothing to do.
import { PrismaClient } from '@prisma/client';

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!ownerUrl || !appUrl) {
  console.log('app-role: MIGRATION_DATABASE_URL not set, skipping (the API uses the owner role)');
  process.exit(0);
}
const owner = new URL(ownerUrl);
const app = new URL(appUrl);
const appUser = decodeURIComponent(app.username);
const appPassword = decodeURIComponent(app.password);
const database = app.pathname.replace(/^\//, '');
if (decodeURIComponent(owner.username) === appUser) {
  console.log('app-role: runtime and owner are the same user, nothing to do');
  process.exit(0);
}
if (!/^[a-z_][a-z0-9_]{2,62}$/.test(appUser) || appPassword.length < 16) {
  throw new Error('app-role: the DATABASE_URL user must be a simple lower-case name and the password at least 16 characters');
}

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const prisma = new PrismaClient({ datasourceUrl: ownerUrl });
try {
  const exists = await prisma.$queryRawUnsafe(`SELECT 1 FROM pg_roles WHERE rolname = ${q(appUser)}`);
  const verb = exists.length ? 'ALTER' : 'CREATE';
  await prisma.$executeRawUnsafe(
    `${verb} ROLE "${appUser}" LOGIN PASSWORD ${q(appPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
  );
  for (const sql of [
    `GRANT CONNECT ON DATABASE "${database}" TO "${appUser}"`,
    `GRANT USAGE ON SCHEMA public TO "${appUser}"`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${appUser}"`,
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "${appUser}"`,
    // Tables created by later migrations are granted automatically.
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${appUser}"`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${appUser}"`,
    // The migration history is the owner's business only.
    `REVOKE ALL ON TABLE "_prisma_migrations" FROM "${appUser}"`,
  ]) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log(`app-role: ${verb === 'CREATE' ? 'created' : 'updated'} "${appUser}" on ${database}`);
} finally {
  await prisma.$disconnect();
}
