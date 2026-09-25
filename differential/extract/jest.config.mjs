// The release's tests as the extractor runs them (differential/extract/
// index.ts, which sets EXTRACT_DIR to a checkout of their tag and
// EXTRACT_OUT to where each file's cases go). The tests run unchanged:
// their `./evaluator` and `../src/…` imports reach the published package
// through differential/extract/v2.ts, and their HTTP through their own
// mocks. The files that evaluate no expression, and 24_cache, whose values
// are random or come from the cache, are not run.
const root = new URL('../../', import.meta.url).pathname
const v2 = `${root}differential/extract/v2.ts`

export default {
  rootDir: process.env.EXTRACT_DIR,
  roots: ['<rootDir>/test'],
  testMatch: ['<rootDir>/test/*.test.ts'],
  testPathIgnorePatterns: [
    '/00_utils\\.',
    '/0_typeCheck\\.',
    '/24_cache\\.',
    '/25_metaData\\.',
    '/27_isFigTreeExpression\\.',
  ],
  transform: {
    '^.+\\.ts$': [
      `${root}node_modules/ts-jest`,
      { isolatedModules: true, tsconfig: `${root}tsconfig.v2.json` },
    ],
  },
  modulePaths: [`${root}node_modules`],
  moduleNameMapper: {
    '^\\./evaluator$': v2,
    '^\\.\\./src/?$': v2,
    '^\\.\\./src/(databaseConnections|FigTreeError|shorthandSyntax|convert|convert/fromShorthand|types|helpers)$':
      v2,
  },
  setupFilesAfterEnv: [`${root}differential/extract/setup.ts`],
  testTimeout: 20000,
}
