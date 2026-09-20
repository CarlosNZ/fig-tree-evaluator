// The on-demand suites (`pnpm test:live`): live network, and a local
// Northwind Postgres. Never part of CI — the default config ignores
// test/live entirely, so these run only when someone asks for them.
export default {
  roots: ['<rootDir>/test/live'],
  testMatch: ['**/?(*.)+(spec|test).+(ts|tsx|js)'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  verbose: true,
  // A real network round trip, and a database that may need to wake up
  testTimeout: 30000,
  maxWorkers: 2,
}
