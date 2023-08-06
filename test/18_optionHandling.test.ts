import { FigTreeEvaluator } from './evaluator'
import { OperatorAlias } from '../src/types'

console.warn = jest.fn() // Don't show console warning in tests

const exp = new FigTreeEvaluator({
  objects: { first: 1, second: 2 },
  functions: { f1: (a: number) => 2 * a },
})

// We need to make sure that options are merged correctly. This means that
// "objects" ,"functions", and "headers" must be merged separately at a deeper
// level than the main "options" object

test('Check options objects get merged correctly', () => {
  return exp
    .evaluate(
      {
        operator: '+',
        values: [
          { operator: 'OBJECT_PROPERTIES', property: 'first' },
          { operator: 'objProps', property: 'third.number' },
        ],
      },
      { objects: { third: { number: 10, word: 'other' } } }
    )
    .then((result) => {
      expect(result).toBe(11)
    })
})

test('Check functions objects get merged correctly', () => {
  return exp
    .evaluate(
      {
        operator: '+',
        values: [
          { operator: 'customFunctions', functionName: 'f1', args: [10] },
          { operator: 'functions', path: 'f2', variables: [7] },
        ],
      },
      { functions: { f2: (a: number) => a + 7 } }
    )
    .then((result) => {
      expect(result).toBe(34)
    })
})

test('Operator exclusion: error when using excluded operator', async () => {
  const figTree = new FigTreeEvaluator({ excludeOperators: ['+', 'pg'] })
  const expression = {
    operator: 'pgSQL',
    query: 'SELECT product_name FROM public.products WHERE category_id = $1 AND supplier_id != $2',
    values: [1, 16],
    type: 'array',
  }
  await expect(figTree.evaluate(expression)).rejects.toThrow('Excluded operator: pg')
})

test('Operator exclusion: ignore invalid exclusion value', async () => {
  const figTree = new FigTreeEvaluator({ excludeOperators: ['XYZ' as OperatorAlias] })
  const expression = {
    operator: '+',
    values: [1, 16],
  }
  return figTree.evaluate(expression).then((result) => {
    expect(result).toEqual(17)
  })
})

// Update using "updateOptions" (and check previously excluded are now available)

test('Operator exclusion: update options later', async () => {
  const figTree = new FigTreeEvaluator({ excludeOperators: ['+'] })
  const expression = {
    operator: '+',
    values: [{ operator: 'subtract', values: [10, 3] }, 10],
  }
  figTree.updateOptions({ excludeOperators: ['-'] })
  await expect(figTree.evaluate(expression)).rejects.toThrow(
    'Operator: PLUS\nExcluded operator: subtract'
  )
})

test('Operator exclusion: update options later -- previous exclusions are restored', async () => {
  const figTree = new FigTreeEvaluator({ excludeOperators: ['+'] })
  const expression = {
    operator: '+',
    values: [8, 9, 10],
  }
  figTree.updateOptions({ excludeOperators: ['-'] })
  return figTree.evaluate(expression).then((result) => {
    expect(result).toEqual(27)
  })
})

test('Operator exclusion: exclude in evaluation call', async () => {
  const figTree = new FigTreeEvaluator()
  const expression = {
    operator: 'multiply',
    values: [{ operator: 'subtract', values: [10, 3] }, 10],
  }
  await expect(figTree.evaluate(expression, { excludeOperators: ['*'] })).rejects.toThrow(
    'Excluded operator: multiply'
  )
})

test('Operator exclusion: exclude in evaluation call -- check only excluded for one evaluation', async () => {
  const figTree = new FigTreeEvaluator()
  const expression = {
    operator: 'multiply',
    values: [{ operator: 'subtract', values: [10, 3] }, 10],
  }
  figTree.evaluate({ operator: '+', values: [1, 2, 3] }, { excludeOperators: ['*'] })
  return figTree.evaluate(expression).then((result) => {
    expect(result).toEqual(70)
  })
})
