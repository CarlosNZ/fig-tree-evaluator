import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default {
  input: 'src/index.ts',
  output: {
    dir: 'build',
    format: 'cjs',
  },
  plugins: [commonjs(), typescript({ module: 'ESNext' }), json(), resolve()],
}
