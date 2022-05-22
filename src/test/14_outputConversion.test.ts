import evaluateExpression from '../evaluateExpression'
import ExpressionEvaluator from '../evaluator'

const exp = new ExpressionEvaluator()

// Non-number unchanged by Number
test('Try and convert NaN to number -- no can do', () => {
  return exp
    .evaluate(
      {
        operator: 'objectProperties',
        property: 'justAString',
        type: 'number',
      },
      { objects: { justAString: 'Not a number' } }
    )
    .then((result: any) => {
      expect(result).toBe('Not a number')
    })
})

// String to number
test('Convert a string to a number', () => {
  return exp
    .evaluate({
      operator: '+',
      values: ['5', '6'],
      type: 'number',
    })
    .then((result: any) => {
      expect(result).toBe(56)
    })
})

// String from various (join into one)
test('Multiple children converted to string, then joined', () => {
  return evaluateExpression({
    operator: '+',
    values: [
      { operator: 'plus', values: [5, 5] },
      { operator: 'and', values: [false, true, true], type: 'string' },
      { operator: '+', values: [null], type: 'string' },
    ],
  }).then((result: any) => {
    expect(result).toBe('10falsenull')
  })
})

// Array -- one not, wrap in array, concat with another array
test('String co-erced to array then merged with another array', () => {
  return evaluateExpression({
    operator: '+',
    values: [[1, 2, 3], { operator: '+', values: [4], type: 'array' }],
  }).then((result: any) => {
    expect(result).toStrictEqual([1, 2, 3, 4])
  })
})

// Various to boolean (0, empty, null, string, number)
test('Various values coerced to boolean then concatenated to array', () => {
  return evaluateExpression({
    operator: '+',
    type: 'array',
    values: [
      { operator: '+', values: ['string'], type: 'bool' },
      { operator: '+', values: [5], type: 'bool' },
      { operator: '+', values: [null], type: 'bool' },
      { operator: '+', values: [0], type: 'bool' },
      { operator: '+', values: [''], type: 'bool' },
    ],
  }).then((result: any) => {
    expect(result).toStrictEqual([true, true, false, false, false])
  })
})

test('Coerce string to boolean', () => {
  return evaluateExpression({
    operator: '=',
    children: [
      {
        operator: '+',
        type: 'bool',
        children: ['three'],
      },
      true,
    ],
  }).then((result: any) => {
    expect(result).toBe(true)
  })
})
