import FigTreeEvaluator, { evaluateExpression } from '../'

const exp = new FigTreeEvaluator()

// EQUAL
test('Equality (numbers)', () => {
  const expression = { operator: '=', children: [100, 100] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (numbers, different)', () => {
  const expression = { operator: 'eq', values: [5, -5] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Equality (strings)', () => {
  const expression = { operator: 'Equal', values: ['Monday', 'Monday'] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test("Equality (strings) -- don't match", () => {
  const expression = { operator: 'Equal', children: ['Monday', 'Tuesday'] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Equality (numbers, many)', () => {
  const expression = { operator: 'EQUAL', children: [99, 99, 99, 99, 99] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (string, single child)', () => {
  const expression = { operator: '=', values: ['All by myself'] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (booleans, nested)', () => {
  const expression = {
    operator: 'equals',
    children: [
      { operator: 'And', values: [true, false] },
      { operator: 'OR', children: [false, false] },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (booleans, nested, not equal)', () => {
  const expression = {
    operator: 'EQ',
    children: [
      { operator: 'And', children: [false, false] },
      { operator: 'OR', children: [false, true] },
    ],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Equality (objects)', () => {
  const expression = {
    operator: '=',
    values: [
      {
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
      {
        operator: '+',
        values: [
          {
            user: {
              id: 2,
              firstName: 'Steve',
              lastName: 'Rogers',
              title: 'The First Avenger',
            },
          },
          {
            organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
            form: { q1: 'Thor', q2: 'Asgard' },
            form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
            application: {
              questions: { q1: 'What is the answer?', q2: 'Enter your name' },
            },
          },
        ],
      },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (objects, not matching)', () => {
  const expression = {
    operator: '=',
    values: [
      {
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
      {
        user: {
          id: 2,
          firstName: 'Steve',
          lastName: 'Rogers',
          title: 'The First Avenger',
        },
        organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
        form: { q1: 'Thor', q2: 'Asgard' },
        form2: { q1: 'Company Application', q2: 'XYZ Chemicals' },
        application: {
          questions: { q1: 'What is the answer?', q2: 'Enter your name' },
        },
      },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Equality (arrays, multiple)', () => {
  const expression = {
    operator: '=',
    values: [
      [1, 2, 3, { propOne: 'ONE' }],
      [1, 2, 3, { propOne: 'ONE' }],
      { operator: '+', type: 'array', children: [1, 2, 3, { propOne: 'ONE' }] },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Equality (arrays, not matching)', () => {
  const expression = {
    operator: '=',
    values: [
      [1, 2, 3, { propOne: 'ONE' }],
      [1, 2, 3, { propOne: 'ONE', propTwo: 'TWO' }],
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

// NOT EQUAL

test('Inequality (numbers)', () => {
  const expression = { operator: '!=', children: [3.14, Math.PI] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Inequality (numbers) -- false', () => {
  const expression = { operator: '!', children: [666, 600 + 66] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Inequality (strings)', () => {
  const expression = { operator: 'ne', values: ['this', 'is not that'] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Inequality (strings, false) -- false', () => {
  const expression = { operator: 'NOT_EQUAL', children: ['Matching', 'Matching'] }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Inequality (boolean, nested)', () => {
  const expression = {
    operator: 'not_equal',
    children: [
      { operator: 'and', children: [false, false] },
      { operator: 'or', children: [false, { operator: 'AND', values: [true, true] }] },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Inequality (multiple, nested, all equal)', () => {
  const expression = {
    operator: 'not_equal',
    children: [
      { operator: '+', values: [5, 5] },
      10,
      { operator: 'substitute', string: '%1%2', replacements: ['1', '0'], type: 'number' },
      10,
      10,
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Inequality (multiple, all different)', () => {
  const expression = {
    operator: 'ne',
    children: [1, 2, 3, 4, 5],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Inequality (multiple, only first different)', () => {
  const expression = {
    operator: 'ne',
    children: ['A', 'B', 'B', 'B', 'B'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Inequality (multiple, one different)', () => {
  const expression = {
    operator: 'ne',
    children: ['B', 'B', 'other', 'B', 'B'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Inequality (only one value)', () => {
  const expression = {
    operator: 'ne',
    children: ['ONE'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(false)
  })
})
