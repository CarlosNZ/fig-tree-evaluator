import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import commentLength from 'eslint-plugin-comment-length'
import globals from 'globals'

const V2_BAN = {
  group: ['**/v2-src', '**/v2-src/**'],
  message:
    'v3 source must not import from the frozen v2 engine (/v2-src). Mine it as data (Phase 15), never wire it in.',
}

// The published v2 package is the converter's tooling's reference, a
// devDependency only ("The v2 package" in docs-dev/v3-specs/v3-converter.md)
const V2_PACKAGE_BAN = {
  group: ['fig-tree-evaluator-v2', 'fig-tree-evaluator-v2/**'],
  message:
    'v3 source must not import the v2 package: it is a devDependency of the converter tooling and tests. src/migrate/ carries its own v2 tables.',
}

// The root source never imports a subpath ("Principles" in
// docs-dev/v3-specs/v3-packaging.md)
const SUBPATH_BANS = [
  {
    group: ['**/editor-hints', '**/editor-hints/**'],
    message:
      'The root entry never imports a subpath: editor-hints is tooling-side data, so importing it here would ship it to every host.',
  },
  {
    group: ['**/migrate', '**/migrate/**'],
    message:
      'The root entry never imports a subpath: the v2 converter is migration tooling, so importing it here would ship it to every host.',
  },
  {
    group: ['**/format', '**/format/**'],
    message:
      'The root entry never imports a subpath: the format conversions are editor tooling, so importing them here would ship them to every host.',
  },
]

export default tseslint.config(
  {
    // The frozen v2 engine and the v2 test copies are never linted (v2-src is
    // a record mined by the Phase-15 converter; test/V2 must stay
    // byte-identical; test/v2-working holds v2-syntax migration source, not
    // v3 code). `.claude` holds agent worktrees — each one a full checkout of
    // this repo, build output and all.
    ignores: [
      'node_modules',
      'build',
      '.claude',
      'v2-src',
      'test/V2',
      'test/v2-working',
      'src/dev/playground.ts',
      'src/dev/playground_example.ts',
      'bench/browser/dist',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build tooling written as plain ESM (rollup config, size report) runs in
    // Node. TS files get their globals from `types: ["node"]` in tsconfig,
    // which no-undef can't see — typescript-eslint disables the rule there.
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
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
    // The differential's corpus and recordings are data: their strings are
    // as long as the v2 tests wrote them, or the database returned them
    files: ['differential/corpus.ts', 'differential/sqlRecordings.ts'],
    rules: { 'max-len': 'off' },
  },
  {
    // An ambient global is declared with `var`, as TypeScript's own lib files
    // do: only a `var` becomes a property of `globalThis`
    files: ['**/*.d.ts'],
    rules: { 'no-var': 'off' },
  },
  {
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [V2_BAN, V2_PACKAGE_BAN] }] },
  },
  {
    // The root side of src/ — everything but the subpaths themselves and the
    // playground, which may import anything
    files: ['src/**/*.ts'],
    ignores: ['src/editor-hints/**', 'src/migrate/**', 'src/format/**', 'src/dev/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [V2_BAN, V2_PACKAGE_BAN, ...SUBPATH_BANS] }],
    },
  },
  {
    // The converter shares no runtime code with the root ("Packaging" in
    // docs-dev/v3-specs/v3-converter.md): type imports erase at build, and a
    // value import from outside src/migrate/ would pull root code into the
    // subpath's bundle. The patterns match an import's text, so each depth of
    // the folder has its own: `./` here, and `./` or `../` in src/migrate/v2/.
    files: ['src/migrate/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\./)',
              allowTypeImports: true,
              message:
                'src/migrate/ imports values from inside the folder only (`import type` from anywhere).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/migrate/*/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.\\.?/)|^\\.\\./\\.\\./',
              allowTypeImports: true,
              message:
                'src/migrate/ imports values from inside the folder only (`import type` from anywhere).',
            },
          ],
        },
      ],
    },
  },
  {
    // ./format shares a few small root modules with the engine ("`./format`"
    // in docs-dev/v3-specs/v3-packaging.md): whatever it imports lands in the
    // chunk the two share, so its value imports outside the folder are held
    // to that set, and the compiler or the registry cannot be pulled in by
    // accident. Type imports erase at build, so they may come from anywhere.
    files: ['src/format/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?!\\./|\\.\\./(compile/references|compile/grammar|utils|primitives/path|names|operators/getShape|FigTreeError|errorCodes)$)',
              allowTypeImports: true,
              message:
                'src/format/ imports values only from inside the folder and from the small root modules it shares with the engine (`import type` from anywhere).',
            },
          ],
        },
      ],
    },
  },
  {
    // editor-hints is data only: type imports erase at build, any value
    // import would pull code into the subpath's bundle
    files: ['src/editor-hints/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**'],
              allowTypeImports: true,
              message: 'editor-hints is a data-only module: import types only (`import type`).',
            },
          ],
        },
      ],
    },
  }
)
