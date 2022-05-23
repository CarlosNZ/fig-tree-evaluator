import evaluateExpression from '../evaluateExpression'
import ExpressionEvaluator from '../evaluator'

const exp = new ExpressionEvaluator({
  objects: {
    functions: {
      fDouble: (...args: any) => args.map((e: any) => e + e),
      fDate: (dateString: string) => new Date(dateString),
    },
  },
})

// OBJECT FUNCTIONS
test('Object functions - double elements in an array', () => {
  const expression = {
    operator: 'objectFunctions',
    children: ['functions.fDouble', 1, 2, 3, 'four'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([2, 4, 6, 'fourfour'])
  })
})

test('Object functions - create a date from a string', () => {
  const expression = {
    operator: 'function',
    children: ['functions.fDate', { operator: '+', children: ['December 17, ', '1995 03:24:00'] }],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toEqual(new Date('December 17, 1995 03:24:00'))
  })
})

test('Object functions - double elements in an array, using properties', () => {
  const expression = {
    operator: 'objectFunctions',
    functionPath: 'functions.fDouble',
    args: [1, 2, 3, 'four'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([2, 4, 6, 'fourfour'])
  })
})

test('Object functions - create a date from a string', () => {
  const expression = {
    operator: 'function',
    functionsPath: 'functions.fDate',
    arguments: [{ operator: '+', children: ['December 17, ', '1995 03:24:00'] }],
  }
  return evaluateExpression(expression, {
    objects: {
      functions: { fDate: (dateString: string) => new Date(dateString) },
    },
  }).then((result: any) => {
    expect(result).toEqual(new Date('December 17, 1995 03:24:00'))
  })
})
