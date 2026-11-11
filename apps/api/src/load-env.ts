/**
 * MUST be the first import of main.ts.
 *
 * Loads the env file for the current APP_ENV (.env.test when APP_ENV=test, else .env) into
 * process.env before anything else is required. Prisma Client auto-loads `.env` when it is
 * first required; without this, a test/demo process could silently pick up the development
 * DATABASE_URL from `.env`. Variables already set in the real environment always win.
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const file = process.env.APP_ENV === 'test' ? '.env.test' : '.env';
const path = join(process.cwd(), file);
if (existsSync(path)) config({ path, override: false, quiet: true });
