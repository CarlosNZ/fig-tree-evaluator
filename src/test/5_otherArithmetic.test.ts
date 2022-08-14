import ExpressionEvaluator, { evaluateExpression } from '../evaluator'

const exp = new ExpressionEvaluator()

// MINUS

test('MINUS operator simple integer subtraction', () => {
  const expression = { operator: 'minus', values: [9, 6] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toEqual(3)
  })
})

test('MINUS operator simple integer subtraction with children', () => {
  const expression = { operator: '-', children: [100, 76] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toEqual(24)
  })
})

test('MINUS operator simple integer subtraction using properties', () => {
  const expression = { operator: '-', subtract: 76, from: 100 }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toEqual(24)
  })
})

test('MINUS operator simple subtraction with negative result', () => {
  const expression = { operator: '-', values: [66, 99] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toEqual(-33)
  })
})

test('MINUS operator with non integers', () => {
  const expression = { operator: '-', subtract: 4.1, subtractFrom: 10.5 }
  return exp.evaluate(expression).then((result: any) => {
    // binary precision issue:
    expect(result).toEqual(6.4)
  })
})

test('MINUS operator subtract floats with negative result', () => {
  const expression = { operator: 'subtract', values: [0.3, 49.777] }
  return exp.evaluate(expression).then((result: any) => {
    // binary precision issue:
    expect(result).toEqual(-49.477000000000004)
  })
})

test('MINUS operator with one NaN operand', () => {
  const expression = { operator: '-', values: [0.3, 'five'] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBeNaN()
  })
})

test('MINUS operator with not enough values', () => {
  const expression = { operator: '-', values: [0.3] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBeNaN()
  })
})

test('MINUS operator with missing "from" property', () => {
  const expression = { operator: '-', subtract: 0.3 }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBeNaN()
  })
})

test('MINUS operator with missing "subtract" property', () => {
  const expression = { operator: '-', from: 10 }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBeNaN()
  })
})
