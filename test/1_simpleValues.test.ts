import FigTreeEvaluator, { evaluateExpression } from '../src'

const exp = new FigTreeEvaluator({ supportDeprecatedValueNodes: true })

test('String literal', () => {
  const expression = 'Just a string'
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('Just a string')
  })
})

test('Boolean', () => {
  const expression = true
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(true)
  })
})

test('Array', () => {
  const expression = ['Pharmaceutical', 'Natural Product', 'Other']
  return evaluateExpression(expression).then((result) => {
    expect(result).toStrictEqual(['Pharmaceutical', 'Natural Product', 'Other'])
  })
})

test('Number', () => {
  const expression = 666
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe(666)
  })
})

test('Object', () => {
  const expression = { one: 1, two: 'two', three: null, four: undefined, five: true, 6: [1, 2, 3] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual({
      one: 1,
      two: 'two',
      three: null,
      four: undefined,
      five: true,
      6: [1, 2, 3],
    })
  })
})

test('Null', () => {
  const expression = null
  return evaluateExpression(expression).then((result) => {
    expect(result).toBeNull()
  })
})

test('Undefined', () => {
  const expression = undefined
  return exp.evaluate(expression).then((result) => {
    expect(result).toBeUndefined()
  })
})

// Deprecated expression syntax, but we'll still support it for now.
test('Testing basic string literal', () => {
  return exp
    .evaluate({
      type: 'string',
      value: 'First Name',
    })
    .then((result) => {
      expect(result).toBe('First Name')
    })
})

test('Testing basic string literal - no type', () => {
  return exp.evaluate({ value: 'First Name' }).then((result) => {
    expect(result).toBe('First Name')
  })
})

test('Testing basic boolean', () => {
  return exp.evaluate({ value: true }).then((result) => {
    expect(result).toBe(true)
  })
})

test('Testing basic Array', () => {
  return exp
    .evaluate({
      type: 'array',
      value: ['Pharmaceutical', 'Natural Product', 'Other'],
    })
    .then((result) => {
      expect(result).toEqual(['Pharmaceutical', 'Natural Product', 'Other'])
    })
})
