import FigTreeEvaluator, { evaluateExpression } from '../'

const exp = new FigTreeEvaluator({
  functions: {
    fDouble: (...args: any) => args.map((e: any) => e + e),
    fDate: (dateString: string) => new Date(dateString),
    fNoArgs: () => 5 * 5,
  },
  objects: { functions: { square: (x: number) => x ** 2 } },
})

// CUSTOM FUNCTIONS
test('Custom functions - double elements in an array', () => {
  const expression = {
    operator: 'customFunctions',
    children: ['fDouble', 1, 2, 3, 'four'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([2, 4, 6, 'fourfour'])
  })
})

test('Custom functions - create a date from a string', () => {
  const expression = {
    operator: 'function',
    children: ['fDate', { operator: '+', children: ['December 17, ', '1995 03:24:00'] }],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toEqual(new Date('December 17, 1995 03:24:00'))
  })
})

test('Custom functions - double elements in an array, using properties', () => {
  const expression = {
    operator: 'objectFunctions',
    functionPath: 'fDouble',
    args: [1, 2, 3, 'four'],
  }
  return exp.evaluate(expression).then((result: any) => {
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
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(7744)
  })
})
test('Custom functions - "functions." is in path string', () => {
  const expression = {
    operator: 'runFunction',
    functionPath: 'functions.fDouble',
    args: [8],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([16])
  })
})

test('Custom functions - create a date from a string', () => {
  const expression = {
    operator: 'function',
    functionsPath: 'fDate',
    arguments: [{ operator: '+', children: ['December 17, ', '1995 03:24:00'] }],
  }
  return evaluateExpression(expression, {
    functions: { fDate: (dateString: string) => new Date(dateString) },
  }).then((result: any) => {
    expect(result).toEqual(new Date('December 17, 1995 03:24:00'))
  })
})

test('Custom functions - no args', () => {
  const expression = {
    operator: 'function',
    functionsPath: 'fNoArgs',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(25)
  })
})

test('Custom functions - no args as children', () => {
  const expression = {
    operator: 'function',
    children: ['fNoArgs'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(25)
  })
})
