import { FigTreeEvaluator, evaluateExpression } from './evaluator'

const exp = new FigTreeEvaluator({
  objects: {
    user: {
      id: 2,
      firstName: 'Steve',
      lastName: 'Rogers',
      title: 'The First Avenger',
    },
    organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
    form: { q1: 'Thor', q2: 'Asgard' },
    form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
    application: {
      questions: { q1: 'What is the answer?', q2: 'Enter your name' },
    },
  },
  nullEqualsUndefined: true,
})

// General errors
test('ERROR - Invalid operator', async () => {
  const expression = {
    operator: 'run',
    children: [1, 2],
  }
  await expect(evaluateExpression(expression)).rejects.toThrow('Invalid operator: run')
})

test('FALLBACK - Invalid operator', () => {
  const expression = {
    operator: 'run',
    children: [1, 2],
    fallback: 'Safe',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Safe')
  })
})

test('ERROR - Invalid/Missing children error', async () => {
  const expression = {
    operator: 'OR',
    children: 2,
  }
  await expect(evaluateExpression(expression)).rejects.toThrow(
    'Operator: OR\n- Property "children" is not of type: array'
  )
})

test('ERROR as string - Invalid/Missing children', () => {
  const expression = {
    operator: 'OR',
    children: 2,
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: OR\n- Property "children" is not of type: array')
  })
})

test('ERROR - Invalid output type', async () => {
  const expression = {
    operator: '+',
    children: [1, 2],
    type: 'Integer',
  }
  await expect(evaluateExpression(expression)).rejects.toThrow(
    'Operator: PLUS\n- Property "type" (value: "Integer") is not of type: Literal("string", "array", "number", "boolean", "bool", undefined)'
  )
})

// Each operator with Error then Fallback

test('OR - Error', async () => {
  const expression = {
    operator: 'OR',
  }
  await expect(exp.evaluate(expression)).rejects.toThrow(
    'Operator: OR\n- Missing required property "values" (type: array)'
  )
})

test('OR - Error as string', () => {
  const expression = {
    operator: 'OR',
  }
  return evaluateExpression(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: OR\n- Missing required property "values" (type: array)')
  })
})

test('OR - Fallback', () => {
  const expression = {
    operator: 'OR',
    fallback: 'All good',
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('All good')
  })
})

test('AND - Error', async () => {
  const expression = {
    operator: 'AND',
  }
  await expect(exp.evaluate(expression)).rejects.toThrow(
    'Operator: AND\n- Missing required property "values" (type: array)'
  )
})

test('AND - Error as string', () => {
  const expression = {
    operator: 'And',
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: AND\n- Missing required property "values" (type: array)')
  })
})

test('OR - Fallback', () => {
  const expression = {
    operator: 'and',
    fallback: 'All good',
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('All good')
  })
})

test('REGEX - Error', async () => {
  const expression = {
    operator: 'regex',
    pattern: { one: 1 },
    testString: 'anything',
  }
  await expect(exp.evaluate(expression)).rejects.toThrow(
    'Operator: REGEX\n- Property "pattern" (value: {"one":1}) is not of type: string'
  )
})

test('REGEX - Fallback', () => {
  const expression = {
    operator: 'pattern-match',
    pattern: { one: 1 },
    testString: 'anything',
    fallback: 'Saved from error',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Saved from error')
  })
})

// Obj Properties errors tested in 7_objectProperties.test.ts

test('API - Fallback', () => {
  const expression = {
    operator: 'get',
    // Typo in URL
    url: 'https://restcountries.com/v3.1/name/zealands',
    returnProperty: 'name.common',
    fallback: null,
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBeNull()
  })
})

test('ERROR - bubble up from nested', async () => {
  const expression = {
    operator: 'and',
    children: [
      { operator: '=', values: [{ operator: 'plus', values: [5, 4] }, 9] },
      {
        operator: 'regex',
        pattern: { one: 1 },
        testString: 'anything',
      },
    ],
  }
  await expect(exp.evaluate(expression)).rejects.toThrow(
    'Operator: REGEX\n- Property "pattern" (value: {"one":1}) is not of type: string'
  )
})

// Fallback bubbles up from nested

test('FALLBACK - multiple bubble up and join', () => {
  const expression = {
    operator: 'join',
    values: [
      {
        operator: 'get',
        // Typo in URL
        url: 'https://restcountries.com/v3.1/name/zealands',
        returnProperty: 'name.common',
        fallback: 'First Error',
      },
      ' / ',
      {
        operator: 'pattern-match',
        pattern: { one: 1 },
        testString: 'anything',
        fallback: 'Second Error',
      },
    ],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('First Error / Second Error')
  })
})

// Edge cases

test('Loose equality - null == undefined', () => {
  const expression = {
    operator: '=',
    values: [null, undefined],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(true)
  })
})

test('Loose equality - null !== undefined', () => {
  const expression = {
    operator: '=',
    values: [null, undefined],
    nullEqualsUndefined: false,
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(false)
  })
})

// Fallback can be evaluated too!
test('Fallback is an operator node', () => {
  const expression = {
    operator: 'get',
    // Typo in URL
    url: 'https://restcountries.com/v3.1/name/zealands',
    returnProperty: 'name.common',
    fallback: { operator: '+', values: [3, 5, 7] },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(15)
  })
})

// Object properties uses its own internal fallback
test('ObjProps Fallback is an operator node', () => {
  const expression = {
    operator: 'objectProperties',
    property: 'user.name',
    fallback: { operator: '+', values: [3, 5, 7] },
  }
  return exp.evaluate(expression, { objects: { user: 'Unknown' } }).then((result) => {
    expect(result).toBe(15)
  })
})

// Skip runtime type checking
test('Skip runtime type checking, from current options', () => {
  const expression = {
    operator: 'objectProperties',
    property: ['not', 'a', 'string'],
  }
  return exp
    .evaluate(expression, {
      objects: { user: 'Unknown' },
      skipRuntimeTypeCheck: true,
      returnErrorAsString: true,
    })
    .then((result) => {
      expect(result).toBe(
        'Operator: OBJECT_PROPERTIES\nUnable to extract object property\nLooking for property: not\nIn object: {"user":"Unknown","organisation":{"id":1,"name":"The Avengers","category":"Superheroes"},"form":{"q...'
      )
    })
})

test('Skip runtime type checking, from constructor options', () => {
  const expression = {
    operator: 'objectProperties',
    property: ['not', 'a', 'string'],
  }
  const exp2 = new FigTreeEvaluator({
    skipRuntimeTypeCheck: true,
    returnErrorAsString: true,
  })
  return exp2
    .evaluate(expression, {
      objects: { user: 'Unknown' },
    })
    .then((result) => {
      expect(result).toBe(
        'Operator: OBJECT_PROPERTIES\nUnable to extract object property\nLooking for property: not\nIn object: {"user":"Unknown"}'
      )
    })
})
