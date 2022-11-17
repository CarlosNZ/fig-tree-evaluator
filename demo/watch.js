// Watch parent repo for changes and updates inner copy if so
const { execSync } = require('child_process')

console.log('Relaunching...')

execSync('cp -R ../src/* ./src/fig-tree-evaluator/src')
execSync('cp ../package.json ./src/fig-tree-evaluator')
execSync('rimraf ./src/fig-tree-evaluator/src/test ./src/fig-tree-evaluator/src/dev')
