import FigTreeEvaluator from '..'

const exp = new FigTreeEvaluator({
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
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

// Alias Nodes

test('Alias Nodes: Do only one network lookup', () => {
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

test('Alias Nodes: Multiple aliases', () => {
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

test('Alias Nodes: Nested aliases, `evaluateFullObject: true`', () => {
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
  return exp.evaluate(expression, { evaluateFullObject: true }).then((result: any) => {
    expect(result).toBe('The flag of New Zealand is 🇳🇿. Here it is again: 🇳🇿')
  })
})

test('Alias Nodes: Alias definition missing, return literal string', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['The flag of New Zealand is %1. Here it is again: %2', '$flag', '$flag'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('The flag of New Zealand is $flag. Here it is again: $flag')
  })
})

// Note: it's doubtful there is a valid use case for this, it's just to check
// internal behaviour is as expected
test('Alias Nodes: Use same alias reference in inner node, should be redefined', () => {
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
        $orgCategory: {
          operator: 'objProps',
          children: ['user.title'],
        },
        operator: 'stringSubstitution',
        string: '%1, %2, %3',
        substitutions: ['$orgCategory', '$orgCategory', '$orgCategory'],
      },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(
      'SuperheroesSuperheroesThe First Avenger, The First Avenger, The First Avenger'
    )
  })
})
