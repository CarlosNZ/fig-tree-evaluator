// On-demand runner for the FROZEN v2 corpus (test/V2) against the frozen v2
// engine (/v2-src). Not part of CI and never run against v3 source — it exists
// so live v2 behaviour stays on tap during hand-migration and the Phase-15
// converter differential (implementation plan 0.1).
//
// The corpus files are byte-identical to their v2 originals: they still import
// from '../src', '../codegen' and './database' / './massiveQuery.json' as they
// did before the freeze. Rather than edit the immutable record, we remap those
// specifiers here — '../src' -> /v2-src, and the shared assets (kept at test/
// top level) back to their real locations. ts-jest runs transpile-only
// (isolatedModules), so TypeScript module resolution never has to agree with
// these runtime mappings.
//
// Run with:  yarn test:v2            (whole corpus)
//            yarn test:v2 <substr>   (matching files)
// HTTP tests use the axios / node-fetch mocks in test/__mocks__ (offline).
// SQL tests (12_database) and the massiveQuery case (17) need a local Northwind
// Postgres — env-gated, skipped when unavailable.
module.exports = {
  roots: ['<rootDir>/test'],
  testMatch: ['<rootDir>/test/V2/**/?(*.)+(spec|test).+(ts|tsx|js)'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { isolatedModules: true, tsconfig: 'tsconfig.v2.json' }],
  },
  moduleNameMapper: {
    '^\\.\\./src$': '<rootDir>/v2-src',
    '^\\.\\./src/(.*)$': '<rootDir>/v2-src/$1',
    '^\\.\\./codegen/(.*)$': '<rootDir>/codegen/$1',
    '^\\./database/(.*)$': '<rootDir>/test/database/$1',
    '^\\./massiveQuery\\.json$': '<rootDir>/test/massiveQuery.json',
  },
  verbose: true,
  testTimeout: 10000,
}
