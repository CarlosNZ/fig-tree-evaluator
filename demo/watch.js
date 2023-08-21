// Watch parent repo for changes and updates inner copy if so
const { execSync } = require('child_process')

console.log('Relaunching...')

// Evaluator
execSync('cp -R ../src/* ./src/fig-tree-evaluator/src')
execSync('cp ../package.json ./src/fig-tree-evaluator')
execSync('rimraf ./src/fig-tree-evaluator/src/test ./src/fig-tree-evaluator/src/dev')

// Expression Editor
execSync('cp -R ../expression-builder/src/* ./src/expression-builder/src')
execSync('cp ../expression-builder/package.json ./src/expression-builder')
