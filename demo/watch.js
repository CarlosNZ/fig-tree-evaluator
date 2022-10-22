// Watch parent repo for changes and updates inner copy if so
const { execSync } = require('child_process')

console.log('Relaunching...')

execSync('cp -R ../src/* ./src/fig-tree-evaluator')
execSync('rimraf ./src/fig-tree-evaluator/test ./src/fig-tree-evaluator/dev')
