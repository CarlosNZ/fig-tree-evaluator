// v3 test suite (the default `pnpm test` and CI). Runs the hand-migrated v3
// tests and the shared test doubles under test/. Two v2 sets are invisible here
// and never run against v3 source (implementation plan working rule 4):
//   - test/V2         — the frozen record; run vs /v2-src with `pnpm test:v2`.
//   - test/v2-working — the editable migration source (not run by any suite).
export default {
  roots: ['<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/V2/', '<rootDir>/test/v2-working/'],
  modulePathIgnorePatterns: ['<rootDir>/test/V2/', '<rootDir>/test/v2-working/'],
  verbose: true,
  testTimeout: 10000,
}
