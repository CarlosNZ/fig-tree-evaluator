import FigTreeEvaluator, { evaluateExpression } from '..'

const exp = new FigTreeEvaluator()

// MATCH
test('Basic match', () => {
  const expression = {
    operator: 'match',
    match: 'simple value',
    'another value': 100,
    'simple value': 99,
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(99)
  })
})

const obj = { myValue: 'This is the way' }

test('Switch with "branches" object', () => {
  const expression = {
    operator: 'switch',
    switch: { operator: 'objectProperties', property: 'myValue' },
    branches: {
      'That is the way': { operator: '+', values: [2, 3, 4] },
      'This is the way': { operator: '+', values: [9, 9, 9] },
    },
  }
  return exp.evaluate(expression, { objects: obj }).then((result: any) => {
    expect(result).toBe(27)
  })
})

// Children
// Branches as array
// Alias nodes
// No match without fallback
// No match with fallback
