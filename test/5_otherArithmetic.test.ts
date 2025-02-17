import { FigTreeEvaluator, evaluateExpression } from './evaluator'

const exp = new FigTreeEvaluator()

// MINUS

test('MINUS operator simple integer subtraction', () => {
  const expression = { operator: 'minus', values: [9, 6] }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(3)
  })
})

test('MINUS operator simple integer subtraction with children', () => {
  const expression = { operator: '-', children: [100, 76] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(24)
  })
})

test('MINUS operator simple integer subtraction using properties', () => {
  const expression = { operator: '-', subtract: 76, from: 100 }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(24)
  })
})

test('MINUS operator simple subtraction with negative result', () => {
  const expression = { operator: '-', values: [66, 99] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(-33)
  })
})

test('MINUS operator with non integers', () => {
  const expression = { operator: '-', subtract: 4.1, subtractFrom: 10.5 }
  return exp.evaluate(expression).then((result) => {
    // binary precision issue:
    expect(result).toEqual(6.4)
  })
})

test('MINUS operator subtract floats with negative result', () => {
  const expression = { operator: 'subtract', values: [0.3, 49.777] }
  return exp.evaluate(expression).then((result) => {
    // binary precision issue:
    expect(result).toEqual(-49.477000000000004)
  })
})

test('MINUS operator with one NaN operand', () => {
  const expression = { operator: '-', values: [0.3, 'five'] }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: SUBTRACT\n- Not all values are numbers')
  })
})

test('MINUS operator with not enough values', async () => {
  const expression = { operator: '-', values: [0.3] }
  await expect(exp.evaluate(expression)).rejects.toThrow('- Not enough values provided')
})

test('MINUS operator with missing "from" property', () => {
  const expression = { operator: '-', subtract: 0.3 }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: SUBTRACT\n- Not enough values provided')
  })
})

test('MINUS operator with missing "subtract" property', () => {
  const expression = { operator: '-', from: 10 }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: SUBTRACT\n- Not enough values provided')
  })
})

test('MULTIPLY operator 2 values', () => {
  const expression = { operator: 'Multiply', values: [2, 4] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(8)
  })
})

test('MULTIPLY operator multiple values', () => {
  const expression = { operator: '*', values: [7, 3, 99] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(2079)
  })
})

test('MULTIPLY operator single value', () => {
  const expression = { operator: 'x', values: [6.5] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(6.5)
  })
})

test('MULTIPLY operator with children', () => {
  const expression = { operator: 'TIMES', children: [8.5, 6, 12] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(612)
  })
})

test('MULTIPLY operator with non-number inputs', () => {
  const expression = { operator: 'X', values: [17, 'twelve'] }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: MULTIPLY\n- Not all values are numbers')
  })
})

test('MULTIPLY - Missing values', () => {
  const expression = { operator: '*' }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe(
      'Operator: MULTIPLY - Type Error\n- Missing required property "values" (type: array)'
    )
  })
})

test('MULTIPLY - Empty values array', () => {
  const expression = { operator: '*', values: [] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(0)
  })
})

test('DIVIDE operator simple integers', () => {
  const expression = { operator: 'divide', values: [60, 20] }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(3)
  })
})

test('DIVIDE operator simple integers with children', () => {
  const expression = { operator: '/', children: [99, 9] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(11)
  })
})

test('DIVIDE operator simple integer division using properties', () => {
  const expression = { operator: '/', dividend: 150, divisor: 4 }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(37.5)
  })
})

test('DIVIDE operator, alias properties with quotient only', () => {
  const expression = { operator: '/', divide: 145, by: 3, output: 'quotient' }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(48)
  })
})

test('DIVIDE operator, alias properties with remainder only', () => {
  const expression = { operator: '/', divide: 145, by: 3, output: 'remainder' }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(1)
  })
})

test('DIVIDE operator with fractional result', () => {
  const expression = { operator: '÷', values: [100, 3] }
  return exp.evaluate(expression).then((result) => {
    // binary precision issue:
    expect(result).toEqual(33.333333333333336)
  })
})

test('DIVIDE - division by zero', async () => {
  const expression = {
    operator: '/',
    dividend: 69,
    divisor: {
      operator: '-',
      values: [6, 6],
    },
  }
  await expect(exp.evaluate(expression)).rejects.toThrow('Division by zero!')
})

test('DIVIDE operator with one NaN operand', () => {
  const expression = { operator: '/', values: [0.3, 'five'] }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: DIVIDE\n- Not all values are numbers')
  })
})

test('DIVIDE operator with not enough values', async () => {
  const expression = { operator: '/', children: [99] }
  await expect(exp.evaluate(expression)).rejects.toThrow('- Not enough values provided')
})

test('DIVIDE operator with Evaluator node values', () => {
  const expression = {
    operator: '÷',
    values: [
      { operator: '+', values: [70, 20] },
      { operator: '+', values: [1, 1, 1] },
    ],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(30)
  })
})

test('Greater than - integer comparison', () => {
  const expression = { operator: 'greaterThan', values: [5, 3] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('Greater than - string comparison', () => {
  const expression = { operator: 'greaterThan', values: ['Large', 'Small'] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

test('Greater than - equal vals, strictly greater', () => {
  const expression = { operator: '>', children: [99.5, 99.5] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

test('Greater than - equal vals, non-strict', () => {
  const expression = { operator: '>', values: [99.5, 99.5], strict: false }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('Greater than - equal vals, strictly greater strings', () => {
  const expression = { operator: '>', children: ['99.5, 99.5', '99.5, 99.5'] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

test('Greater than - equal vals, non-strict strings', () => {
  const expression = {
    operator: 'larger',
    children: ['One', 'One'],
    strict: { operator: 'AND', values: [true, false] },
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('Greater than - missing values', async () => {
  const expression = { operator: '>' }
  await expect(exp.evaluate(expression)).rejects.toThrow(
    '- Missing required property "values" (type: array)'
  )
})

test('Greater than - not enough values', async () => {
  const expression = { operator: '>', values: [12] }
  await expect(exp.evaluate(expression)).rejects.toThrow('- Not enough values provided')
})

test('Less than - integer comparison', () => {
  const expression = { operator: 'lessThan', values: [5, 3] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

test('Less than - string comparison', () => {
  const expression = { operator: 'lessThan', values: ['Large', 'Small'] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('Less than - equal vals, strictly smaller', () => {
  const expression = { operator: '<', children: [99.5, 99.5] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

test('Less than - equal vals, non-strict', () => {
  const expression = { operator: '<', values: [99.5, 99.5], strict: false }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('Less than - equal vals, strictly smaller strings', () => {
  const expression = { operator: '<', children: ['99.5, 99.5', '99.5, 99.5'] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(false)
  })
})

test('Less than - equal vals, non-strict strings', () => {
  const expression = {
    operator: 'smaller',
    children: ['One', 'One'],
    strict: { operator: 'OR', values: [false, false] },
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toEqual(true)
  })
})

test('Less than - missing values', async () => {
  const expression = { operator: '<' }
  await expect(exp.evaluate(expression)).rejects.toThrow(
    '- Missing required property "values" (type: array)'
  )
})

test('Less than - Empty values array', () => {
  const expression = { operator: '<', values: [] }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: LESS_THAN\n- Not enough values provided')
  })
})

test('Count - simple array', () => {
  const expression = { operator: 'count', values: [1, 2, 3] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(3)
  })
})

test('Count - simple array using children', () => {
  const expression = { operator: 'count', children: ['a', 'b', { $plus: [1, 2, 3] }] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(3)
  })
})

test('Count - simple array using children, with operator node that returns an array', () => {
  const expression = { operator: 'count', children: { $pass: [1, 2, 3] } }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(3)
  })
})

test('Count - empty array', () => {
  const expression = { operator: 'length', children: [] }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(0)
  })
})

test('Count - values not an array', () => {
  const expression = { operator: 'length', values: 'Wrong' }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toEqual(
      'Operator: COUNT - Type Error\n- Property "values" (value: "Wrong") is not of type: array'
    )
  })
})

test('Count - missing values', () => {
  const expression = { operator: 'Count' }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe(
      'Operator: COUNT - Type Error\n- Missing required property "values" (type: array)'
    )
  })
})

// Combine operators

test('Combine arithmetic operators', () => {
  const expression = {
    operator: '+',
    values: {
      operator: 'join',
      children: [
        {
          operator: '-',
          subtract: { operator: 'count', values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
          from: 10,
          outputType: {
            operator: '?',
            condition: { operator: '>', values: ['Book', 'Apple'] },
            valueIfTrue: 'array',
            valueIfFalse: 'string',
          },
        },
        {
          operator: '*',
          children: [0.5, { operator: '/', output: 'remainder', values: [48, 10] }, 0.5],
          outputType: 'array',
        },
        { operator: '/', divide: 81, by: 9, outputType: 'array' },
      ],
    },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(12)
  })
})
