import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { loadTestEnv } from './env';

/**
 * Brings the dedicated *_test database up to date (non-destructive `migrate deploy`), upserts
 * reference data and creates the plain app role the API runs as, so row-level security is in force
 * for every test (test/prepare-db.mjs, shared with the browser suites). Tests never depend on an
 * empty database: each test creates its own uniquely-named merchants.
 */
export default function globalSetup(): void {
  loadTestEnv();
  execFileSync(process.execPath, [join(__dirname, 'prepare-db.mjs')], { cwd: join(__dirname, '..'), stdio: ['ignore', 'ignore', 'inherit'] });
}
