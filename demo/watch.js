// Watch parent repo for changes and updates inner copy if so
import { execSync } from 'child_process'

console.log('Relaunching...')

// Evaluator to Expression Editor
execSync('cp -R ../src/* ../expression-builder/src/fig-tree-evaluator/src')
execSync(
  'rimraf ../expression-builder/src/fig-tree-evaluator/src/dev ../expression-builder/src/fig-tree-evaluator/src/test'
)

// Expression Editor
execSync('cp -R ../expression-builder/src/* ./src/expression-builder/src')
execSync('cp ../expression-builder/package.json ./src/expression-builder')
