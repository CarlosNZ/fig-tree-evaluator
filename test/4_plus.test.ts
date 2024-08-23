import { FigTreeEvaluator, evaluateExpression } from './evaluator'

const exp = new FigTreeEvaluator({ returnErrorAsString: true })

// PLUS

test('Adding 2 numbers', () => {
  const expression = { operator: '+', children: [6, 6] }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe(12)
  })
})

test('Adding 4 numbers', () => {
  const expression = { operator: 'Plus', children: [7.5, 25, -0.1, 6] }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe(38.4)
  })
})

test('Concatenate 2 Arrays', () => {
  const expression = {
    operator: 'concat',
    children: [
      [1, 2, 3],
      ['Four', 'Five', 'Six'],
    ],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([1, 2, 3, 'Four', 'Five', 'Six'])
  })
})

test('Concatenate 4 Arrays, including nested', () => {
  const expression = {
    operator: 'join',
    children: [
      [1, 2, 3],
      ['Four', 'Five', 'Six'],
      [7, 8, 'Nine'],
      [['Four', 'Five', 'Six'], 'The', 'End'],
    ],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([
      1,
      2,
      3,
      'Four',
      'Five',
      'Six',
      7,
      8,
      'Nine',
      ['Four', 'Five', 'Six'],
      'The',
      'End',
    ])
  })
})

test('Concatenate 3 Strings', () => {
  const expression = {
    operator: 'CONCAT',
    children: ['Tony', ' ', 'Stark'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Tony Stark')
  })
})

test('Concatenate Strings, output as Array', () => {
  const expression = {
    operator: 'add',
    type: 'array',
    values: ['One', 'Two', 'Three'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['One', 'Two', 'Three'])
  })
})

test('Merge 2 objects', () => {
  const expression = {
    operator: 'Merge',
    children: [
      { one: 1, two: '2', three: false },
      { four: [1, 2, 3], five: true },
    ],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toStrictEqual({ one: 1, two: '2', three: false, four: [1, 2, 3], five: true })
  })
})

test('Merge 3 objects', () => {
  const expression = {
    operator: '+',
    children: [
      { one: 1, two: '2', three: undefined },
      { four: [1, 2, 3], five: true },
      { 1: null, 2: 'TRUE' },
    ],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toStrictEqual({
      one: 1,
      two: '2',
      three: undefined,
      four: [1, 2, 3],
      five: true,
      1: null,
      2: 'TRUE',
    })
  })
})

test('Missing values', () => {
  const expression = { operator: '+' }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(
      'Operator: PLUS - Type Error\n- Missing required property "values" (type: array)'
    )
  })
})

test('Empty values array', () => {
  const expression = { operator: '+', values: [] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([])
  })
})
