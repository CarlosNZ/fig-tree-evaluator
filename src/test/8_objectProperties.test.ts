import FigTreeEvaluator, { evaluateExpression } from '../'

const exp = new FigTreeEvaluator({
  data: {
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
  return exp.evaluate(expression, { data: { name: 'Wanda' } }).then((result: any) => {
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
  return exp.evaluate(expression, { data: {} }).then((result: any) => {
    expect(result).toBe('Sorry 🤷‍♂️')
  })
})

test('Object properties with additional objects', () => {
  const expression = {
    operator: 'objectProperties',
    path: 'newThing.first',
    additionalObjects: { newThing: { first: 'A New Value' } },
  }
  return exp.evaluate(expression, { data: {} }).then((result: any) => {
    expect(result).toBe('A New Value')
  })
})

test('Object properties with more complex additional objects', () => {
  const expression = {
    operator: 'objectProperties',
    path: 'vehicle.model.versions[2]',
    additionalData: {
      vehicle: {
        make: 'Honda',
        model: { name: 'Accord', versions: ['Type A', 'Type B', 'Type C'] },
      },
    },
  }
  return exp.evaluate(expression, { data: {} }).then((result: any) => {
    expect(result).toBe('Type C')
  })
})

test('Object properties with additional objects, fallback', () => {
  const expression = {
    operator: 'objectProperties',
    path: 'vehicle.model.versions[3]',
    additional: {
      vehicle: {
        make: 'Honda',
        model: { name: 'Accord', versions: ['Type A', 'Type B', 'Type C'] },
      },
    },
    fallback: 'Nope',
  }
  return exp.evaluate(expression, { data: {} }).then((result: any) => {
    expect(result).toBe('Nope')
  })
})

test('Object properties dynamically-built additionalObject', () => {
  const expression = {
    operator: 'objectProperties',
    path: 'second',
    objects: {
      operator: 'buildObject',
      values: [
        { key: 'first', value: 1 },
        { key: 'second', value: 100 },
      ],
    },
  }
  return exp.evaluate(expression, { data: {} }).then((result: any) => {
    expect(result).toBe(100)
  })
})
