/** Unit tests (no database). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@onepay/shared$': '<rootDir>/../../../packages/shared/src',
  },
};
