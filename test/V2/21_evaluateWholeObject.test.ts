import { FigTreeEvaluator } from './evaluator'

const exp = new FigTreeEvaluator({
  evaluateFullObject: true,
  returnErrorAsString: true,
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

// Evaluate whole object, even if the root is not an Operator Node

test('Evaluate whole object', () => {
  const expression = {
    outerObject: {
      one: 1,
      2: {
        a: 'A',
        b: { operator: '+', values: [1, 2, 3] },
        another: { operator: 'objProps', property: 'user.title' },
      },
    },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual({
      outerObject: {
        one: 1,
        2: {
          a: 'A',
          b: 6,
          another: 'The First Avenger',
        },
      },
    })
  })
})

test("Don't evaluate whole object", () => {
  const expression = {
    outerObject: {
      one: 1,
      2: {
        a: 'A',
        b: { operator: '+', values: [1, 2, 3] },
        another: { operator: 'objProps', property: 'user.title' },
      },
    },
  }
  return exp.evaluate(expression, { evaluateFullObject: false }).then((result) => {
    expect(result).toStrictEqual({
      outerObject: {
        one: 1,
        2: {
          a: 'A',
          b: { operator: '+', values: [1, 2, 3] },
          another: { operator: 'objProps', property: 'user.title' },
        },
      },
    })
  })
})

test('Multiple levels of deep operator nodes, with alias node', () => {
  const expression = {
    outer: {
      operator: '+',
      values: [
        { six: '$six' },
        { two: { notOperator: 'OK', isOperator: { operator: '+', values: [1, 2, 3] } } },
        { three: 3 },
      ],
      $six: { operator: '+', values: [1, 2, 3] },
    },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual({
      outer: { six: 6, two: { notOperator: 'OK', isOperator: 6 }, three: 3 },
    })
  })
})

test('Evaluate alias nodes even if not within operator node', () => {
  const expression = {
    $testAlias: {
      operator: 'getData',
      property: 'user.title',
    },
    type: 'Control',
    text: '$testAlias',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual({ type: 'Control', text: 'The First Avenger' })
  })
})
