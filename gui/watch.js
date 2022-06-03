// Watch parent repo for changes and updates inner copy if so
const { execSync } = require('child_process')

console.log('Relaunching...')

execSync('cp -R ../src/* ./src/expression-evaluator')
execSync('rimraf ./src/expression-evaluator/test ./src/expression-evaluator/dev')
