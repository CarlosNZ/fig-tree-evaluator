import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'
import sizes from 'rollup-plugin-sizes'
import bundleSize from 'rollup-plugin-bundle-size'

export default [
  {
    input: 'src/index.ts',
    // ESM-only (docs-dev/v3-specs/v3-packaging.md, open Q1 resolved July
    // 2026): a CJS copy riding along can dual-load in one process and break
    // the identity machinery (brand symbol, EvaluationData sentinel,
    // instanceof FigTreeError). CJS consumers on Node >=20.19 use
    // require(esm); older consumers stay on v2.
    output: [
      {
        file: 'build/index.js',
        format: 'esm',
      },
    ],
    // Compiler settings come from tsconfig.json (ES2022 / ESNext modules) —
    // the single source of truth; no inline overrides
    plugins: [typescript(), terser(), bundleSize(), sizes()],
    // dequal is v3's one runtime dependency (docs-dev/v3-specs/v3-packaging.md)
    external: ['dequal', 'dequal/lite'],
  },
  {
    // Bundle the per-file declarations (build/dts, emitted by the pass above)
    // into the single published index.d.ts
    input: './build/dts/index.d.ts',
    output: [{ file: 'build/index.d.ts', format: 'es' }],
    plugins: [dts()],
  },
]
