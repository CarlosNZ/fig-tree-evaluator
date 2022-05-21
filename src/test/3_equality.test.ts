import evaluateExpression from '../evaluateExpression'
import { ExpressionEvaluator } from '../evaluator'

const exp = new ExpressionEvaluator()

// EQUAL
test('Equality (numbers)', () => {
  const expression = { operator: '=', children: [100, 100] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (numbers, different)', () => {
  const expression = { operator: 'eq', values: [5, -5] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Equality (strings)', () => {
  const expression = { operator: 'Equal', values: ['Monday', 'Monday'] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test("Equality (strings) -- don't match", () => {
  const expression = { operator: 'Equal', children: ['Monday', 'Tuesday'] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Equality (numbers, many)', () => {
  const expression = { operator: 'EQUAL', children: [99, 99, 99, 99, 99] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (string, single child)', () => {
  const expression = { operator: '=', values: ['All by myself'] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (booleans, nested)', () => {
  const expression = {
    operator: 'equals',
    children: [
      { operator: 'And', values: [true, false] },
      { operator: 'OR', children: [false, false] },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (booleans, nested, not equal)', () => {
  const expression = {
    operator: 'EQ',
    children: [
      { operator: 'And', children: [false, false] },
      { operator: 'OR', children: [false, true] },
    ],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

// NOT EQUAL

test('Inequality (numbers)', () => {
  const expression = { operator: '!=', children: [3.14, Math.PI] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Inequality (numbers) -- false', () => {
  const expression = { operator: '!', children: [666, 600 + 66] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Inequality (strings)', () => {
  const expression = { operator: 'ne', values: ['this', 'is not that'] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Inequality (strings, false) -- false', () => {
  const expression = { operator: 'NOT_EQUAL', children: ['Matching', 'Matching'] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Inequality (boolean, nested)', () => {
  const expression = {
    operator: 'not_equal',
    children: [
      { operator: 'and', children: [false, false] },
      { operator: 'or', children: [false, { operator: 'AND', values: [true, true] }] },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})
