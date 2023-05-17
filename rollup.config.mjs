import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'
import ts from 'rollup-plugin-ts'
// import resolve from '@rollup/plugin-node-resolve'
// import commonjs from '@rollup/plugin-commonjs'

export default [
  {
    input: 'src/index.ts',
    output: {
      dir: 'build',
      format: 'esm',
    },
    plugins: [typescript({ module: 'ESNext' }), ts(), json()],
    // external: [/node_modules/],
  },
  // {
  //   // path to your declaration files root
  //   input: './build/index.d.ts',
  //   output: [{ file: 'build/index.d.ts', format: 'es' }],
  //   plugins: [dts()],
  // },
]
