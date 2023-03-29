import FigTreeEvaluator, { evaluateExpression } from '../src'

const exp = new FigTreeEvaluator()

// AND

test('AND operator with 2 children', () => {
  const expression = { operator: 'and', children: [true, true] }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('AND operator with 2 children, one false', () => {
  const expression = { operator: 'AND', values: [true, false] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

test('AND operator with 4 children, 1 nested', () => {
  const expression = {
    operator: '__AND__',
    values: [true, true, true, { operator: 'AND', children: [true, true] }],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('AND operator with 4 children, 1 false, 2 nested', () => {
  const expression = {
    operator: 'and_',
    children: [true, true, true, { operator: 'AND', values: [false, true] }],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

// OR

test('OR operator with 2 children', () => {
  const expression = { operator: 'Or', children: [true, true] }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('OR operator with 2 children, one false', () => {
  const expression = { operator: 'OR', values: [true, false] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('OR operator with 4 children, 2 nested', () => {
  const expression = {
    operator: 'OR',
    values: [
      true,
      { operator: 'AND', children: [false, true] },
      { operator: 'And', children: [true, true] },
      false,
    ],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('OR operator with 4 children, all false', () => {
  const expression = {
    operator: 'OR',
    values: [
      false,
      { operator: 'AND', children: [false, true] },
      { operator: 'Or', children: [false, false] },
      false,
    ],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

// Non-boolean operands

test('OR - Non-boolean operands - OR', () => {
  const expression = {
    operator: 'OR',
    values: ['this', 'that'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('AND - Non-boolean operands', () => {
  const expression = {
    operator: 'AND',
    values: ['this', 'that'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('OR - Non-boolean falsy operands', () => {
  const expression = {
    operator: 'OR',
    values: [false, null, undefined, NaN, 0, ''],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

test('OR - Non-boolean operands, only one truthy', () => {
  const expression = {
    operator: 'OR',
    values: [false, null, 'Not falsy', undefined, NaN, 0, ''],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('AND - Non-boolean falsy operands', () => {
  const expression = {
    operator: 'OR',
    values: [false, null, undefined, NaN, 0, ''],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})
