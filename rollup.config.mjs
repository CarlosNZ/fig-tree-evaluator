import typescript from '@rollup/plugin-typescript'
import dts from 'rollup-plugin-dts'
import sizes from 'rollup-plugin-sizes'
import { terser } from 'rollup-plugin-terser'

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'build/index.cjs.js',
        format: 'cjs',
      },
      {
        file: 'build/index.esm.js',
        format: 'esm',
      },
    ],
    plugins: [typescript({ module: 'ESNext' }), sizes(), terser()],
    external: ['change-case', 'axios', 'object-property-extractor', 'dequal/lite'],
  },
  {
    // path to your declaration files root
    input: './build/dts/index.d.ts',
    output: [{ file: 'build/index.d.ts', format: 'es' }],
    plugins: [dts()],
  },
]
