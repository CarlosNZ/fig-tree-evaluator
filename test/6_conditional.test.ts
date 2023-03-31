import FigTreeEvaluator, { evaluateExpression } from '../src'

const exp = new FigTreeEvaluator({ returnErrorAsString: true })

// CONDITIONAL
test('Basic conditional', () => {
  const expression = { operator: '?', children: [true, 'A', 'B'] }
  return evaluateExpression(expression).then((result) => {
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
  return exp.evaluate(expression).then((result) => {
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
  return exp.evaluate(expression).then((result) => {
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
  return exp.evaluate(expression).then((result) => {
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
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('Expression is False')
  })
})

test('Conditional -- missing parameters', async () => {
  const expression = {
    operator: '?',
  }
  await expect(evaluateExpression(expression)).rejects.toThrow(
    'Operator: CONDITIONAL\n- Missing required property "condition" (type: any)\n- Missing required property "valueIfTrue" (type: any)\n- Missing required property "valueIfFalse" (type: any)'
  )
})

test('Conditional -- 1 missing parameter (error as string)', () => {
  const expression = {
    operator: '?',
    condition: 'YES',
    valueIfFalse: 'NO',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(
      'Operator: CONDITIONAL\n- Missing required property "valueIfTrue" (type: any)'
    )
  })
})

test('Conditional -- condition is Truthy', () => {
  const expression = {
    operator: '?',
    condition: 'YES',
    valueIfTrue: 'YES',
    valueIfFalse: 'NO',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('YES')
  })
})

test('Conditional -- condition is Falsy', () => {
  const expression = {
    operator: '?',
    condition: 0,
    valueIfTrue: 'YES',
    valueIfFalse: 'NO',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('NO')
  })
})
