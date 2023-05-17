import typescript from '@rollup/plugin-typescript'
import dts from 'rollup-plugin-dts'
// import resolve from '@rollup/plugin-node-resolve'
// import commonjs from '@rollup/plugin-commonjs'

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'build/index.cjs.js',
      format: 'cjs',
    },
    plugins: [typescript({ module: 'ESNext' })],
    external: ['change-case', 'axios', 'object-property-extractor', 'dequal/lite'],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'build/index.esm.js',
      format: 'esm',
    },
    plugins: [typescript({ module: 'ESNext' })],
    external: ['change-case', 'axios', 'object-property-extractor', 'dequal/lite'],
  },
  {
    // path to your declaration files root
    input: './build/dts/index.d.ts',
    output: [{ file: 'build/index.d.ts', format: 'es' }],
    plugins: [dts()],
  },
]
