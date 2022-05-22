import evaluateExpression from '../evaluateExpression'
import ExpressionEvaluator from '../evaluator'

const exp = new ExpressionEvaluator({
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
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('Safe')
  })
})

test('ERROR - Invalid/Missing children error', async () => {
  const expression = {
    operator: 'OR',
    children: 2,
  }
  await expect(evaluateExpression(expression)).rejects.toThrow(
    'Invalid child nodes (children) array'
  )
})

test('ERROR as string - Invalid/Missing children', () => {
  const expression = {
    operator: 'OR',
    children: 2,
  }
  return evaluateExpression(expression, { returnErrorAsString: true }).then((result: any) => {
    expect(result).toBe('Invalid child nodes (children) array')
  })
})

test('ERROR - Invalid output type', async () => {
  const expression = {
    operator: '+',
    children: [1, 2],
    type: 'Integer',
  }
  await expect(evaluateExpression(expression)).rejects.toThrow('Invalid output type: Integer')
})

// Each operator with Error then Fallback

test('OR - Error', async () => {
  const expression = {
    operator: 'OR',
  }
  await expect(evaluateExpression(expression)).rejects.toThrow('Missing properties: values')
})

test('OR - Error as string', () => {
  const expression = {
    operator: 'OR',
  }
  return evaluateExpression(expression, { returnErrorAsString: true }).then((result: any) => {
    expect(result).toBe('Missing properties: values')
  })
})

test('OR - Fallback', () => {
  const expression = {
    operator: 'OR',
    fallback: 'All good',
  }
  return evaluateExpression(expression, { returnErrorAsString: true }).then((result: any) => {
    expect(result).toBe('All good')
  })
})

test('AND - Error', async () => {
  const expression = {
    operator: 'AND',
  }
  await expect(exp.evaluate(expression)).rejects.toThrow('Missing properties: values')
})

test('OR - Error as string', () => {
  const expression = {
    operator: 'And',
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result: any) => {
    expect(result).toBe('Missing properties: values')
  })
})

test('OR - Fallback', () => {
  const expression = {
    operator: 'and',
    fallback: 'All good',
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result: any) => {
    expect(result).toBe('All good')
  })
})

// Error bubbles up from nested

// Fallback bubbles up from nested

// Array of fallbacks from children
