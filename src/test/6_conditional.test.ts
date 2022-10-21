import FigTreeEvaluator, { evaluateExpression } from '../FigTreeEvaluator'

const exp = new FigTreeEvaluator()

// CONDITIONAL
test('Basic conditional', () => {
  const expression = { operator: '?', children: [true, 'A', 'B'] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('A')
  })
})

test('Conditional with Addition', () => {
  const expression = {
    operator: 'conditional',
    children: [
      { operator: '=', children: [{ operator: '+', children: [7.5, 19] }, 26.5] },
      'Correct',
      'Wrong',
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('Correct')
  })
})

test('Conditional with Logical Expression (using properties)', () => {
  const expression = {
    operator: 'if-then',
    condition: {
      operator: 'and',
      children: [
        { operator: '=', values: [{ operator: '+', children: [7.5, 19] }, 26.5] },
        { operator: '!=', values: ['five', 'four'] },
      ],
    },
    valueIfTrue: 'Expression is True',
    valueIfFalse: 'Expression is False',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('Expression is True')
  })
})

test('Conditional with Logical Expression (using aliased properties)', () => {
  const expression = {
    operator: 'if-then',
    condition: {
      operator: 'and',
      children: [
        { operator: '=', values: [{ operator: '+', children: [7.5, 19] }, 26.5] },
        { operator: '!=', values: ['five', 'four'] },
      ],
    },
    ifTrue: 'Expression is True',
    ifFalse: 'Expression is False',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('Expression is True')
  })
})

test('Conditional with False Logical Expression', () => {
  const expression = {
    operator: '?',
    children: [
      {
        operator: 'Or',
        children: [
          { operator: 'eq', children: [{ operator: '+', children: [7, 19] }, 26.5] },
          { operator: 'NotEqual', children: ['five', 'five'] },
        ],
      },
      'Expression is True',
      'Expression is False',
    ],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('Expression is False')
  })
})
