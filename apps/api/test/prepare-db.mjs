#!/usr/bin/env node
/**
 * Brings the dedicated *_test database up to date for any e2e suite (API, merchant and admin
 * browser tests): non-destructive `migrate deploy`, reference data, and the plain app role the
 * API under test connects as (so row-level security is in force).
 *
 * The browser suites run this before starting the API (Playwright starts its web servers before
 * globalSetup, and on a fresh database the app role would not exist yet).
 *
 *   node test/prepare-db.mjs        (from apps/api; reads apps/api/.env.test)
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const env = { ...process.env };
for (const line of readFileSync(join(apiDir, '.env.test'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
}
env.APP_ENV = 'test';
if (!/\/[a-z0-9_]*_test(\?|$)/.test(env.DATABASE_URL ?? '')) {
  console.error('Refusing to prepare: DATABASE_URL in apps/api/.env.test must point at a *_test database');
  process.exit(1);
}

// Owner runs migrations and seed; the app role is created (or its password reset) last.
const owner = { ...env, DATABASE_URL: env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, SEED_SUPER_ADMIN_EMAIL: '', SEED_SUPER_ADMIN_PASSWORD: '' };
const run = (cmd, e) => execSync(cmd, { cwd: apiDir, env: e, stdio: ['ignore', 'ignore', 'inherit'] });
run('npx prisma migrate deploy', owner);
run('npx ts-node prisma/seed.ts', owner);
run('node prisma/app-role.mjs', env);
