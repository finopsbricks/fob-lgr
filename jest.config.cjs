/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // The package is ESM ("type": "module"), so tests run under Node's ESM VM
  // modules flag rather than being transformed — see the `test` script.
  transform: {},
  testMatch: ['<rootDir>/tests/**/*.test.js'],
};
