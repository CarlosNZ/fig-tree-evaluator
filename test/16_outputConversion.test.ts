import { FigTreeEvaluator, evaluateExpression } from '../src'

const exp = new FigTreeEvaluator()

// Non-number unchanged by Number
test('Try and convert NaN to number -- return 0', () => {
  return exp
    .evaluate(
      {
        operator: 'objectProperties',
        property: 'justAString',
        type: 'number',
      },
      { objects: { justAString: 'Not a number' } }
    )
    .then((result) => {
      expect(result).toBe(0)
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
    .then((result) => {
      expect(result).toBe(56)
    })
})

// Number to string
test('Convert a number to a string', () => {
  return exp
    .evaluate({
      operator: '+',
      values: [150, 150],
      outputType: 'string',
    })
    .then((result) => {
      expect(result).toBe('300')
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
  }).then((result) => {
    expect(result).toBe('10falsenull')
  })
})

// Array -- one not, wrap in array, concat with another array
test('String co-erced to array then merged with another array', () => {
  return evaluateExpression({
    operator: '+',
    values: [[1, 2, 3], { operator: '+', values: [4], type: 'array' }],
  }).then((result) => {
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
  }).then((result) => {
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
  }).then((result) => {
    expect(result).toBe(true)
  })
})

// Passthru operator
test('Pass through unmodified (passThru operator)', () => {
  return evaluateExpression({ operator: 'pass', value: 999.99 }).then((result) => {
    expect(result).toBe(999.99)
  })
})

test('Pass through unmodified using children', () => {
  return evaluateExpression({ operator: 'pass', children: [999.99] }).then((result) => {
    expect(result).toBe(999.99)
  })
})

test('Pass through unmodified using children -- multiple values', () => {
  return evaluateExpression({ operator: 'pass', children: [999.99, 'three'] }).then((result) => {
    expect(result).toEqual([999.99, 'three'])
  })
})

test('Pass through with evaluation, coerce to number', () => {
  return evaluateExpression({
    operator: 'pass',
    children: [{ operator: '+', values: ['9', '99', '.', '99'] }],
    outputType: 'number',
  }).then((result) => {
    expect(result).toBe(999.99)
  })
})

test('Pass through with evaluation, coerce to string', () => {
  return evaluateExpression({
    operator: 'pass',
    value: { operator: 'add', values: [900, 90, 9, 0.99] },
    outputType: 'string',
  }).then((result) => {
    expect(result).toBe('999.99')
  })
})

// Output type can be itself evaluated
test('Coerce output to string from evaluated "type" node', () => {
  return evaluateExpression(
    {
      operator: 'objectProperties',
      path: 'find.me',
      outputType: { operator: '+', values: ['str', 'ing'] },
    },
    { objects: { find: { me: 500 } } }
  ).then((result) => {
    expect(result).toBe('500')
  })
})

// Aggressive number extraction
test('Extract numberic content from string', () => {
  return evaluateExpression({
    operator: 'pass',
    value: 'There is a number 46 inside here!',
    outputType: 'number',
  }).then((result) => {
    expect(result).toBe(46)
  })
})

test('Extract decimal numeric content from string', () => {
  return evaluateExpression(
    {
      operator: 'objectProperties',
      path: 'standard.path',
      outputType: 'number',
    },
    { objects: { standard: { path: "99.021 is what we're looking for" } } }
  ).then((result) => {
    expect(result).toBe(99.021)
  })
})

test('Extract with no leading 0 from start of string', () => {
  return evaluateExpression(
    {
      operator: 'objectProperties',
      path: 'basic',
      outputType: 'number',
    },
    { objects: { basic: '.001 is a very small number' } }
  ).then((result) => {
    expect(result).toBe(0.001)
  })
})

test('Add two extracted numbers', () => {
  return evaluateExpression(
    {
      operator: '+',
      values: [
        { operator: 'pass', value: 'The number is .995 not 0.23', outputType: 'number' },
        {
          operator: 'objectProperties',
          path: 'Not.found',
          fallback: { $pass: 'We have 3 people', outputType: 'number' },
        },
      ],
    },
    { objects: {} }
  ).then((result) => {
    expect(result).toBe(3.995)
  })
})

test('Handle number conversion when already a number', () => {
  return evaluateExpression({
    operator: '+',
    values: [1, 2, 3, 4, 5, 6],
    outputType: 'number',
  }).then((result) => {
    expect(result).toBe(21)
  })
})

test('Return 0 if converting to number when string has no numeric content', () => {
  return evaluateExpression({
    operator: '+',
    values: ['this', 'plus', 'this'],
    outputType: 'number',
  }).then((result) => {
    expect(result).toBe(0)
  })
})
