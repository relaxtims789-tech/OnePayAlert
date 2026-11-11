import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Loads apps/api/.env.test into process.env and refuses to run against a non-test database. */
export function loadTestEnv(): void {
  const file = join(__dirname, '..', '.env.test');
  const content = readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) process.env[m[1]] = m[2];
  }
  process.env.APP_ENV = 'test';
  const url = process.env.DATABASE_URL ?? '';
  if (!/\/[a-z0-9_]*_test(\?|$)/.test(url)) {
    throw new Error(`Refusing to run e2e tests: DATABASE_URL must point at a *_test database (${url})`);
  }
}
