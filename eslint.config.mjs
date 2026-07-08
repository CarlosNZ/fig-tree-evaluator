import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import commentLength from 'eslint-plugin-comment-length'

export default tseslint.config(
  {
    // The frozen v2 engine and the v2 test copies are never linted (v2-src is
    // a record mined by the Phase-15 converter; test/V2 must stay
    // byte-identical; test/v2-working holds v2-syntax migration source, not
    // v3 code). test/__mocks__ is v2-only HTTP mock infrastructure used by
    // `pnpm test:v2`; v3 tests use the injected MockHttpClient double
    // (test/helpers) instead.
    ignores: [
      'node_modules',
      'build',
      'v2-src',
      'test/V2',
      'test/v2-working',
      'test/__mocks__',
      'src/dev/playground.ts',
      'src/dev/playground_example.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'comment-length': commentLength },
    rules: {
      // `//` comments: enforced + auto-fixable (reflow) via plugin. Its
      // multi-line sibling is NOT used — it mangles non-JSDoc /* blocks.
      'comment-length/limit-single-line-comments': ['error', { maxLength: 80 }],
      // Block-comment lines: enforced (not auto-fixable) via core max-len.
      // `code` is set high so Prettier (100) stays the authority on code
      // width.
      'max-len': ['error', { code: 200, comments: 80, ignoreUrls: true }],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/v2-src', '**/v2-src/**'],
              message:
                'v3 source must not import from the frozen v2 engine (/v2-src). Mine it as data (Phase 15), never wire it in.',
            },
          ],
        },
      ],
    },
  }
)
