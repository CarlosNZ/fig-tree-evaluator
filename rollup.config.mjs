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
    plugins: [typescript(), terser(), collectBundleSize()],
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
