x = {
  operator: '+',
  values: [
    {
      operator: '?', // conditional
      condition: {
        operator: '=', // equality
        values: [
          {
            operator: 'objectProperties', // extracted from passed-in object
            property: 'responses.Q1',
          },
          'correct',
        ],
      },
      valueIfTrue: 1,
      valueIfFalse: 0,
    },
    {
      operator: 'GET', // API lookup
      url: 'https://my.server.com/api/get-count',
    },
    3,
  ],
}

x = {
  responses: {
    Q1: 'correct',
    Q2: 'incorrect',
  },
}

const user = {
  firstName: 'Peter',
  lastName: 'Parker',
  alias: 'Spider-man',
  friends: ['Ned', 'MJ', 'Peter 2', 'Peter 3'],
  enemies: [
    { name: 'The Vulture', identity: 'Adrian Toomes' },
    { name: 'Green Goblin', identity: 'Norman Osborne' },
  ],
}

const exp = new ExpressionEvaluator()

let expression = {
  operator: 'objectProperties',
  property: 'user.firstName',
}

expression = {
  operator: 'getProperty',
  path: 'user.friends[1]',
}

expression = {
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
    'countries.emoji',
  ],
  type: 'string',
}

exp.evaluate(expression, { objects: { user } })
