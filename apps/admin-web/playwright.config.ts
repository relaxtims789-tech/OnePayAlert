import { defineConfig } from '@playwright/test';
import { API_PORT, WEB_PORT } from './e2e/fixtures';

/**
 * MysoftKH Super Admin e2e: real browser → admin Next.js (production build) → NestJS API (test env)
 * → PostgreSQL/Redis/RabbitMQ. Uses its own ports so it can run beside the merchant suite.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.output',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: 'chrome',
    headless: true,
    locale: 'en-US',
    timezoneId: 'Asia/Phnom_Penh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npx nest build -p tsconfig.e2e.json && node dist-e2e/main.js',
      cwd: '../api',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: { APP_ENV: 'test', PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      env: {
        API_URL: `http://localhost:${API_PORT}`,
        REALTIME_URL: `http://localhost:${API_PORT}`,
        COOKIE_SECURE: 'false',
        SESSION_COOKIE_PREFIX: 'opa',
        NEXT_DIST_DIR: '.next-e2e',
      },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
