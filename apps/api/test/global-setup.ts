import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { loadTestEnv } from './env';

/**
 * Brings the dedicated *_test database up to date (non-destructive `migrate deploy`) and
 * upserts reference data. Tests never depend on an empty database: each test creates its own
 * uniquely-named merchants, so data from previous runs is harmless.
 */
export default function globalSetup(): void {
  loadTestEnv();
  const cwd = join(__dirname, '..');
  // Migrations and reference data run as the owner; the API under test runs as a plain role
  // (created here) so row-level security is in force for every test.
  const owner = { ...process.env, DATABASE_URL: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL, SEED_SUPER_ADMIN_EMAIL: '', SEED_SUPER_ADMIN_PASSWORD: '' };
  execSync('npx prisma migrate deploy', { cwd, env: owner, stdio: 'pipe' });
  execSync('npx ts-node prisma/seed.ts', { cwd, env: owner, stdio: 'pipe' });
  execSync('node prisma/app-role.mjs', { cwd, env: process.env, stdio: 'pipe' });
}
