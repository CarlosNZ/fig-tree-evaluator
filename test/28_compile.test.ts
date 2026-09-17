import { FigTreeEvaluator } from './evaluator'
import { isCompiledNode } from '../src'
import massiveQuery from './massiveQuery.json'
import { config as massiveQueryConfig } from '../codegen/queryBuilder'

const exp = new FigTreeEvaluator({
  data: {
    user: { firstName: 'Steve', lastName: 'Rogers', age: 105, isActive: true },
    values: [1, 2, 3],
  },
  functions: {
    double: (n: number) => n * 2,
  },
  fragments: {
    adder: { operator: '+', values: '$values' },
    greeting: 'Hello!',
  },
})

// Runs both the raw and compiled expression against each of the given
// options overrides and asserts identical results
const expectSameResult = async (expression: object, optionsList: object[] = [{}]) => {
  const compiled = exp.compile(expression)
  for (const options of optionsList) {
    const [rawResult, compiledResult] = await Promise.all([
      exp.evaluate(expression, options),
      exp.evaluate(compiled, options),
    ])
    expect(compiledResult).toStrictEqual(rawResult)
  }
}

test('compile() marks the returned tree as pre-compiled', () => {
  const compiled = exp.compile({ operator: '+', values: [1, 2] })
  expect(isCompiledNode(compiled)).toBe(true)
  expect(isCompiledNode({ operator: '+', values: [1, 2] })).toBe(false)
})

test('compile() does not add enumerable properties (identical JSON shape, aside from operator canonicalisation)', () => {
  const expression = { operator: 'AND', values: [true, false] }
  const compiled = exp.compile(expression)
  expect(JSON.parse(JSON.stringify(compiled))).toStrictEqual(expression)
})

test('Equivalence -- basic logical/arithmetic operators', async () => {
  await expectSameResult({ operator: 'AND', values: [true, true, false] })
  await expectSameResult({ operator: 'OR', values: [true, false] })
  await expectSameResult({ operator: '+', values: [1, 2, 3] })
  await expectSameResult({ operator: 'EQUAL', values: [1, '1'] })
})

test('Equivalence -- conditional, exercised both true and false', async () => {
  const expression = {
    operator: '?',
    condition: { operator: 'getData', property: 'user.isActive' },
    valueIfTrue: 'active',
    valueIfFalse: 'inactive',
  }
  await expectSameResult(expression, [
    {},
    { data: { user: { isActive: false } } },
    { data: { user: { isActive: true } } },
  ])
})

test('Equivalence -- shorthand syntax and operator aliases', async () => {
  await expectSameResult({ $and: [true, { $getData: 'user.isActive' }] })
  await expectSameResult({ operator: 'plus', values: [1, 2] })
  await expectSameResult({ operator: '&&', values: [true, true] })
})

test('Equivalence -- object properties / getData nested paths', async () => {
  await expectSameResult({ operator: 'objectProperties', property: 'user.firstName' })
  await expectSameResult(
    {
      operator: 'buildObject',
      properties: [{ key: 'name', value: { operator: 'getData', property: 'user.firstName' } }],
    },
    [{}]
  )
})

test('Equivalence -- custom functions, including shorthand form', async () => {
  await expectSameResult({ operator: 'customFunctions', function: 'double', args: [5] })
  await expectSameResult({ operator: 'double', args: [21] })
})

test('Equivalence -- fragments', async () => {
  await expectSameResult({ fragment: 'greeting' })
  await expectSameResult({ fragment: 'adder', parameters: { $values: [10, 20, 30] } })
  await expectSameResult({ fragment: 'adder', $values: [1, 2, 3] })
})

test('Equivalence -- error/fallback paths', async () => {
  await expectSameResult({ operator: 'notAnOperator', values: [1, 2], fallback: 'Safe' })
  await expectSameResult({ operator: 'AND', values: 'not-an-array', fallback: 'Safe' })
})

test('Equivalence -- alias nodes', async () => {
  await expectSameResult({
    $x: { operator: '+', values: [1, 1] },
    operator: '+',
    values: ['$x', '$x'],
  })
})

test('Equivalence -- large real-world expression tree (massiveQuery fixture)', async () => {
  const massiveExp = new FigTreeEvaluator(massiveQueryConfig)
  const compiled = massiveExp.compile(massiveQuery)
  const [rawResult, compiledResult] = await Promise.all([
    massiveExp.evaluate(massiveQuery, massiveQueryConfig),
    massiveExp.evaluate(compiled, massiveQueryConfig),
  ])
  expect(compiledResult).toStrictEqual(rawResult)
})

test('Stale config -- compiling before a custom function is registered bakes in the old shape', async () => {
  const localExp = new FigTreeEvaluator({})
  // At compile time, "double" is not yet a registered custom function, so
  // this custom-operator-shorthand node cannot be normalised to a
  // CUSTOM_FUNCTIONS node -- that normalisation is baked in at compile time.
  const expression = { operator: 'double', args: [21] }
  const compiled = localExp.compile(expression)

  localExp.updateOptions({ functions: { double: (n: number) => n * 2 } })

  // Evaluating the *uncompiled* expression freshly re-checks `functions` and
  // picks up the newly-registered custom function...
  await expect(localExp.evaluate(expression)).resolves.toBe(42)
  // ...but the pre-compiled version was normalised before "double" existed,
  // so it still fails as an unrecognised operator. This is expected --
  // callers must recompile after changing `functions`/`fragments`. (The
  // message says "Excluded" rather than "Invalid" because a pre-compiled
  // node's `operator` field is trusted as already-canonical and skips
  // re-resolution -- still a real, correct rejection either way.)
  await expect(localExp.evaluate(compiled)).rejects.toThrow('Excluded operator: double')
})
