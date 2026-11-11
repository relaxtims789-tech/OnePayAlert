/** End-to-end tests against a real PostgreSQL test database (DATABASE_URL from .env.test). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  globalSetup: '<rootDir>/global-setup.ts',
  setupFiles: ['<rootDir>/load-env.ts'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@onepay/shared$': '<rootDir>/../../../packages/shared/src',
  },
};
