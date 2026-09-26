import { readFileSync } from 'node:fs'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'
import { collectBundleSize, printBundleSize } from './codegen/bundleSize.mjs'
import { CHUNKS_DIR, ENTRIES } from './codegen/entries.mjs'

// package.json must name exactly the entries built here, with the paths the
// build writes — checked before building anything. Twice over: in `exports`,
// and in the `types` + `typesVersions` fallback that TypeScript's legacy
// `node` resolution reads instead, since it ignores `exports`
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const declarations = (name) => `./build/${name}.d.ts`
const subpaths = ENTRIES.filter(({ subpath }) => subpath !== '.')
const expected = {
  exports: Object.fromEntries(
    ENTRIES.map(({ subpath, name }) => [
      subpath,
      { types: declarations(name), default: `./build/${name}.js` },
    ])
  ),
  types: declarations(ENTRIES.find(({ subpath }) => subpath === '.').name),
  typesVersions: {
    '*': Object.fromEntries(
      subpaths.map(({ subpath, name }) => [subpath.slice('./'.length), [declarations(name)]])
    ),
  },
}
for (const [field, value] of Object.entries(expected))
  if (JSON.stringify(manifest[field]) !== JSON.stringify(value))
    throw new Error(
      `package.json "${field}" does not match codegen/entries.mjs — expected:\n` +
        JSON.stringify(value, null, 2)
    )

// The top-level calls a consumer's bundler may drop when it drops the
// binding they initialize (#193). Each entry ships as one file, and
// `sideEffects: false` works per file, so inside a file a bundler keeps any
// top-level call it cannot prove pure, and everything that call reaches:
// without these, importing `version` alone carries every core operator.
// Rollup infers some of this purity itself; esbuild and webpack read only
// the annotation. Each is a callee as rollup prints it (a `$1` suffix, from
// rollup's renaming, is allowed for).
const PURE_CALLEES = [
  // The operator-definition factories: each returns a new object and
  // touches nothing else. `declareOperator` is left off: it returns its
  // argument, so terser inlines every call to it, and an annotated call is
  // one terser keeps
  'ordering',
  'unary',
  'extremum',
  'normalizer',
  'emptyArrayWarning',
  // Building the core set: `coreOperators`
  'coreDefinitions.map',
  'new Set',
  'Object.freeze',
]

/**
 * Prefix each listed call with `/*#__PURE__*\/`, before terser, which keeps
 * the annotations under `format.preserve_annotations`. Only a call that
 * initializes a top-level declaration is marked, since that is the only
 * place the annotation can mean "droppable with its binding": the same call
 * in a statement position (a bare `Object.freeze(x)`) is there for its
 * effect. `pnpm check:package` bundles a small import with esbuild and
 * fails on operator or engine code in it, which catches a callee renamed
 * out from under this list.
 */
const pureAnnotations = () => {
  const escape = (callee) => callee.replace(/[.$]/g, '\\$&')
  const pattern = new RegExp(
    `^((?:export )?(?:const|let|var) [\\w$]+ = )((?:${PURE_CALLEES.map(escape).join('|')})(?:\\$\\d+)?\\()`,
    'gm'
  )
  return {
    name: 'pure-annotations',
    renderChunk: (code) => {
      const annotated = code.replace(pattern, '$1/*#__PURE__*/ $2')
      return annotated === code ? null : { code: annotated, map: null }
    },
  }
}

export default [
  {
    // One pass over every entry, so shared code is emitted once as a chunk
    // (codegen/entries.mjs), never copied per entry
    input: Object.fromEntries(ENTRIES.map(({ name, source }) => [name, source])),
    // ESM-only (docs-dev/v3-specs/v3-packaging.md, open Q1 resolved July
    // 2026): a CJS copy riding along can dual-load in one process and break
    // the identity machinery (brand symbol, EvaluationData sentinel,
    // instanceof FigTreeError). CJS consumers on Node >=22.12 use
    // require(esm); older consumers stay on v2.
    output: {
      dir: 'build',
      format: 'esm',
      entryFileNames: '[name].js',
      chunkFileNames: `${CHUNKS_DIR}/shared.js`,
    },
    // Compiler settings come from tsconfig.json (ES2022 / ESNext modules) —
    // the single source of truth; no inline overrides
    plugins: [
      typescript(),
      pureAnnotations(),
      terser({ format: { preserve_annotations: true } }),
      collectBundleSize(),
    ],
  },
  // Bundle each entry's per-file declarations (build/dts, emitted by the
  // pass above under the source's own path) into one self-contained .d.ts
  // beside its bundle. Separate passes, so no entry's types import from
  // another's: the types shared by two entries are structural, so a copy in
  // each is the same type
  ...ENTRIES.map(({ name, source }, i) => ({
    input: source.replace(/^src\//, './build/dts/').replace(/\.ts$/, '.d.ts'),
    output: { file: `build/${name}.d.ts`, format: 'es' },
    // The size report runs last, so it can weigh every declaration file
    plugins: [dts(), ...(i === ENTRIES.length - 1 ? [printBundleSize()] : [])],
  })),
]
