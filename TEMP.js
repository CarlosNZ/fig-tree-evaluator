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
  operator: 'postgres',
  children: ["SELECT contact_name FROM customers where customer_id = 'FAMIA';"],
  type: 'string',
}

exp.evaluate(expression, { objects: { user } })
