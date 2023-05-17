import { FigTreeEvaluator, evaluateExpression } from '../src'

const exp = new FigTreeEvaluator()

// REGEX
test('Testing Regex - Email validation', () => {
  const expression = {
    operator: 'REGEX',
    children: ['info@somwhere.net', '^[A-Za-z0-9.]+@[A-Za-z0-9]+\\.[A-Za-z0-9.]+$'],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe(true)
  })
})

test('Testing Regex - Email validation false, using properties', () => {
  const expression = {
    operator: 'pattern-match',
    pattern: '^[A-Za-z0-9.]+@[A-Za-z0-9]+\\.[A-Za-z0-9.]+$',
    testString: 'info@wherever$net',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(false)
  })
})
