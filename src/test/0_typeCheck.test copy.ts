import ExpressionEvaluator, { evaluateExpression } from '../evaluator'

const exp = new ExpressionEvaluator()

test('String literal', () => {
  const expression = 'Just a string'
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('Just a string')
  })
})
