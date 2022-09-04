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

y = {
  operator: '=',
  values: [3, 3, 'three'],
}
