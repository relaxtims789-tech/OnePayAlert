import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests: real browser → Next.js (production build) → NestJS API → PostgreSQL,
 * Redis and RabbitMQ. The API runs with APP_ENV=test against the dedicated onepay_test DB.
 * Requires `docker compose up -d postgres redis rabbitmq`. Builds the API and web app itself.
 */
const WEB_PORT = 3100;
const API_PORT = 4101;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.output',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // Uses the locally installed Google Chrome; no browser download needed.
    channel: 'chrome',
    headless: true,
    locale: 'en-US',
    timezoneId: 'Asia/Phnom_Penh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      // Separate output dir so a running `start:dev` watcher on dist/ is never disturbed.
      // The database is prepared here, not in globalSetup: Playwright starts web servers first,
      // and on a fresh database the API's role would not exist yet.
      command: 'node test/prepare-db.mjs && npx nest build -p tsconfig.e2e.json && node dist-e2e/main.js',
      cwd: '../api',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: { APP_ENV: 'test', PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      env: {
        API_URL: `http://localhost:${API_PORT}`,
        REALTIME_URL: `http://localhost:${API_PORT}`,
        COOKIE_SECURE: 'false',
        NEXT_DIST_DIR: '.next-e2e',
      },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
