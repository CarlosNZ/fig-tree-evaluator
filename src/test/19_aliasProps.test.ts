import FigTreeEvaluator, { evaluateExpression } from '../'

const exp = new FigTreeEvaluator({
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

// Alias props

test('Alias props: Do only one network lookup', () => {
  const expression = {
    operator: '?',
    $getNZ: {
      operator: 'GET',
      children: ['https://restcountries.com/v3.1/name/zealand', [], 'name.common'],
      type: 'string',
    },
    condition: {
      operator: '!=',
      values: ['$getNZ', null],
    },
    valueIfTrue: '$getNZ',
    valueIfFalse: 'Not New Zealand',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('New Zealand')
  })
})

test('Alias props: Multiple aliases', () => {
  const expression = {
    operator: '+',
    $orgCategory: {
      operator: 'objProps',
      children: ['organisation.category'],
    },
    values: [
      '$orgCategory',
      '$orgCategory',
      {
        operator: 'stringSubstitution',
        string: '%1, %2, %3',
        substitutions: ['$orgCategory', '$orgCategory', '$orgCategory'],
      },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('SuperheroesSuperheroesSuperheroes, Superheroes, Superheroes')
  })
})

test('Alias props: Nested aliases', () => {
  const expression = {
    $flag: {
      $emoji: { operator: '+', values: ['countries.', 'emoji'] },
      operator: 'GraphQL',
      children: [
        `query getCountry($code: String!) {
            countries(filter: {code: {eq: $code}}) {
              name
              emoji
            }
          }`,
        null,
        ['code'],
        'NZ',
        '$emoji',
      ],
      type: 'string',
    },
    operator: 'stringSubstitution',
    children: ['The flag of New Zealand is %1. Here it is again: %2', '$flag', '$flag'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('The flag of New Zealand is 🇳🇿. Here it is again: 🇳🇿')
  })
})
