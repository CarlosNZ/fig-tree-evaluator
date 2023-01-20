import FigTreeEvaluator from '../src'

const exp = new FigTreeEvaluator({
  objects: { first: 1, second: 2 },
  functions: { f1: (a: any) => 2 * a },
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
    .then((result: any) => {
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
      { functions: { f2: (a: any) => a + 7 } }
    )
    .then((result: any) => {
      expect(result).toBe(34)
    })
})
