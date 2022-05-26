import ExpressionEvaluator, { evaluateExpression } from '../evaluator'

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

// OBJECT PROPERTIES
test('Object properties - single property', () => {
  const expression = {
    operator: 'objectProperties',
    children: ['user.firstName'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('Steve')
  })
})

test('Object properties, deeper, using properties', () => {
  const expression = {
    operator: 'getProperty',
    property: 'application.questions.q2',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('Enter your name')
  })
})

test('Object properties, first level, object passed into instance', () => {
  const expression = {
    operator: 'get_obj_prop',
    path: 'name',
  }
  return exp.evaluate(expression, { objects: { name: 'Wanda' } }).then((result: any) => {
    expect(result).toBe('Wanda')
  })
})

test('Object properties, unresolved path', async () => {
  const expression = {
    operator: 'objectProperties',
    children: ['application.questions.q5'],
  }
  await expect(exp.evaluate(expression)).rejects.toThrow(
    /Unable to extract object property\nLooking for property: q5\nIn object: {"q1":"What is the answer\?","q2":"Enter your name"}/
  )
})

test('Object properties, unresolved path with Null fallback', () => {
  const expression = {
    operator: 'objectProperties',
    property: 'application.querstions.q2.go.even.deeper',
    fallback: null,
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBeNull()
  })
})

test('Object properties, unresolved path (first level) with fallback', () => {
  const expression = {
    operator: 'objectProperties',
    path: 'cantFind',
    fallback: 'Sorry 🤷‍♂️',
  }
  return exp.evaluate(expression, { objects: {} }).then((result: any) => {
    expect(result).toBe('Sorry 🤷‍♂️')
  })
})
