import { FigTreeEvaluator, evaluateExpression } from './evaluator'

const exp = new FigTreeEvaluator({
  functions: {
    fDouble: (...args: number[]) => args.map((e) => e + e),
    fDate: (dateString: string) => new Date(dateString),
    fNoArgs: () => 5 * 5,
    reverse: {
      function: (input: unknown[] | string) => {
        if (Array.isArray(input)) return [...input].reverse()
        return input.split('').reverse().join('')
      },
      description: 'Reverse a string or array',
      parameterDefaults: ['Reverse Me'],
    },
    getFullName: (nameObject: { firstName: string; lastName: string }) => {
      return `${nameObject.firstName} ${nameObject.lastName}`
    },
  },
  objects: { functions: { square: (x: number) => x ** 2, notAFunction: 'sorry' } },
})

// CUSTOM FUNCTIONS
test('Custom functions - double elements in an array', () => {
  const expression = {
    operator: 'customFunctions',
    children: ['fDouble', 1, 2, 3, 'four'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([2, 4, 6, 'fourfour'])
  })
})

test('Custom functions - create a date from a string', () => {
  const expression = {
    operator: 'function',
    children: ['fDate', { operator: '+', children: ['December 17, ', '1995 03:24:00'] }],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toEqual(new Date('December 17, 1995 03:24:00'))
  })
})

test('Custom functions - double elements in an array, using properties', () => {
  const expression = {
    operator: 'objectFunctions',
    functionPath: 'fDouble',
    args: [1, 2, 3, 'four'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([2, 4, 6, 'fourfour'])
  })
})

// The following two tests are just for backwards compatibility with
// configurations created with an older version of the evaluator
test('Custom functions - fallback to a function on Objects not Functions option', () => {
  const expression = {
    operator: 'runFunction',
    functionPath: 'functions.square',
    args: [88],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(7744)
  })
})
test('Custom functions - "functions." is in path string', () => {
  const expression = {
    operator: 'runFunction',
    functionPath: 'functions.fDouble',
    args: [8],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([16])
  })
})

test('Custom functions - create a date from a string', () => {
  const expression = {
    operator: 'function',
    functionPath: 'fDate',
    input: { operator: '+', children: ['December 17, ', '1995 03:24:00'] },
  }
  return evaluateExpression(expression, {
    functions: { fDate: (dateString: string) => new Date(dateString) },
  }).then((result) => {
    expect(result).toEqual(new Date('December 17, 1995 03:24:00'))
  })
})

test('Custom functions - no args', () => {
  const expression = {
    operator: 'function',
    functionPath: 'fNoArgs',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(25)
  })
})

test('Custom functions - no args as children', () => {
  const expression = {
    operator: 'function',
    children: ['fNoArgs'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(25)
  })
})

test('Custom functions - invalid function path', () => {
  const expression = {
    operator: 'function',
    functionPath: 'invalid.path',
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: CUSTOM_FUNCTIONS\n- No function found: "invalid.path"')
  })
})

test('Custom functions - path is not a function', () => {
  const expression = {
    operator: 'function',
    functionPath: 'functions.notAFunction',
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe('Operator: CUSTOM_FUNCTIONS\n- No function found: "functions.notAFunction"')
  })
})

test('Custom functions - verbose function definition structure', () => {
  const expression = {
    operator: 'function',
    function: 'reverse',
    input: [1, 2, 3, 4],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([4, 3, 2, 1])
  })
})

test('Custom functions - object properties become argument', () => {
  const expression = {
    operator: 'function',
    function: 'getFullName',
    firstName: 'Mark',
    lastName: 'Hamill',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([4, 3, 2, 1])
  })
})
