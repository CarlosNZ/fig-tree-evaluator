import FigTreeEvaluator, { evaluateExpression } from '../'

const exp = new FigTreeEvaluator()

test('String literal', () => {
  const expression = 'Just a string'
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('Just a string')
  })
})

test('Boolean', () => {
  const expression = true
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Array', () => {
  const expression = ['Pharmaceutical', 'Natural Product', 'Other']
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toStrictEqual(['Pharmaceutical', 'Natural Product', 'Other'])
  })
})

test('Number', () => {
  const expression = 666
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(666)
  })
})

test('Object', () => {
  const expression = { one: 1, two: 'two', three: null, four: undefined, five: true, 6: [1, 2, 3] }
  return exp.evaluate(expression).then((result: any) => {
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
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBeNull()
  })
})

test('Undefined', () => {
  const expression = undefined
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBeUndefined()
  })
})
