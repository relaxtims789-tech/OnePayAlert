import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPER_ADMIN, SUPPORT } from './fixtures';

/** Migrates + seeds the dedicated test database and creates the MysoftKH staff test accounts. */
export default function globalSetup(): void {
  const apiDir = join(__dirname, '..', '..', 'api');
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const line of readFileSync(join(apiDir, '.env.test'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]!] = m[2]!;
  }
  env.APP_ENV = 'test';
  if (!/\/[a-z0-9_]*_test(\?|$)/.test(env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run e2e: DATABASE_URL in apps/api/.env.test must point at a *_test database');
  }
  execSync('npx prisma migrate deploy', { cwd: apiDir, env, stdio: 'pipe' });
  execSync('npx ts-node prisma/seed.ts', { cwd: apiDir, env: { ...env, SEED_SUPER_ADMIN_EMAIL: '', SEED_SUPER_ADMIN_PASSWORD: '' }, stdio: 'pipe' });
  execFileSync(process.execPath, [join(__dirname, 'seed-staff.mjs'), JSON.stringify([SUPER_ADMIN, SUPPORT])], { cwd: apiDir, env, stdio: 'pipe' });
}
