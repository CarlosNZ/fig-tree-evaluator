const path = require('path')
const nodeExternals = require('webpack-node-externals')

module.exports = {
  entry: ['./src/index.ts'],
  resolve: {
    extensions: ['.ts'],
  },
  target: 'node',
  mode: 'production',
  externals: [nodeExternals()],
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'index.js',
  },
  module: {
    rules: [
      // all files with a `.ts` extension will be handled by `ts-loader`
      { test: /\.ts$/, loader: 'ts-loader' },
    ],
  },
}
