import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'
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
    plugins: [typescript({ module: 'ESNext' }), json()],
    // external: [/node_modules/],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'build/index.esm.js',
      format: 'esm',
    },
    plugins: [typescript({ module: 'ESNext' }), json()],
    // external: [/node_modules/],
  },
  {
    // path to your declaration files root
    input: './build/dts/index.d.ts',
    output: [{ file: 'build/index.d.ts', format: 'es' }],
    plugins: [dts(), json()],
  },
]
