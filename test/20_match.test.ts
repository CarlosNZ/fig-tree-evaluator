import FigTreeEvaluator, { evaluateExpression } from '../src'

const exp = new FigTreeEvaluator()

// MATCH
test('Basic match', () => {
  const expression = {
    operator: 'match',
    matchExpression: 'simple value',
    'another value': 100,
    'simple value': 99,
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe(99)
  })
})

const state = {
  weather: 'rainy',
  humidity: 'high',
  wind: 'strong',
}

test('Switch with "branches" object', () => {
  const expression = {
    operator: 'switch',
    match: { operator: 'objectProperties', property: 'weather' },
    branches: {
      sunny: { operator: '+', values: [2, 3, 4] },
      rainy: { operator: '+', values: [9, 9, 9] },
    },
  }
  return exp.evaluate(expression, { objects: state }).then((result: any) => {
    expect(result).toBe(27)
  })
})

test('Match with "branches" object built using buildObject', () => {
  const expression = {
    operator: 'match',
    match: { operator: 'objectProperties', property: 'weather' },
    branches: {
      operator: 'buildObject',
      properties: [
        { key: 'sunny', value: { operator: '+', values: [2, 3, 4] } },
        { key: 'rainy', value: { operator: '+', values: [9, 9, 9] } },
      ],
    },
  }
  return exp.evaluate(expression, { objects: state }).then((result: any) => {
    expect(result).toBe(27)
  })
})

test('Match with children, nested', () => {
  const expression = {
    operator: 'match',
    children: [
      { operator: 'objectProperties', property: 'weather' },
      'sunny',
      {
        operator: 'match',
        match: {
          operator: 'objProps',
          property: 'humidity',
        },
        high: 'NO',
        normal: 'YES',
      },
      'cloudy',
      'YES',
      'rainy',
      {
        operator: 'match',
        match: {
          operator: 'objProps',
          property: 'wind',
        },
        branches: ['strong', 'NO', 'weak', 'YES'],
      },
    ],
  }
  return exp.evaluate(expression, { objects: state }).then((result: any) => {
    expect(result).toBe('NO')
  })
})

// Decision Tree -- includes aliases, fallbacks, multiple operator types

// Diagram of decision tree:
// https://user-images.githubusercontent.com/5456533/208660132-39f42ecf-894f-4e7a-891d-ce3a2d184d02.png
const decisionTree = {
  operator: 'match',
  matchExpression: {
    operator: 'objProps',
    property: 'numberOfPlayers',
  },
  branches: {
    1: {
      operator: '?',
      condition: {
        operator: '>',
        values: [
          {
            operator: 'objProps',
            property: 'ageOfYoungestPlayer',
          },
          7,
        ],
        strict: false,
      },
      ifTrue: 'Solitaire',
      ifFalse: 'No recommendations 😔',
    },
    fallback: {
      operator: '?',
      condition: {
        operator: '>',
        values: [
          {
            operator: 'objProps',
            property: 'ageOfYoungestPlayer',
          },
          5,
        ],
        strict: false,
      },
      ifTrue: {
        operator: '?',
        condition: {
          operator: '<',
          values: [
            {
              operator: 'objProps',
              property: 'ageOfYoungestPlayer',
            },
            8,
          ],
        },
        ifTrue: 'Go Fish',
        ifFalse: {
          operator: '?',
          condition: {
            operator: '<',
            values: [
              {
                operator: 'objProps',
                property: 'ageOfYoungestPlayer',
              },
              12,
            ],
          },
          ifTrue: '$difficultyYounger',
          ifFalse: {
            operator: '?',
            condition: {
              operator: '<',
              values: [
                {
                  operator: 'objProps',
                  property: 'ageOfYoungestPlayer',
                },
                16,
              ],
            },
            ifTrue: '$difficultyOlder',
            ifFalse: {
              operator: 'match',
              match: {
                operator: 'objProps',
                property: 'numberOfPlayers',
              },
              4: {
                operator: '?',
                condition: {
                  operator: '=',
                  values: [
                    {
                      operator: 'objProps',
                      property: 'preferredDifficulty',
                    },
                    'hard',
                  ],
                },
                ifTrue: 'Bridge',
                ifFalse: '$difficultyOlder',
              },
              fallback: '$difficultyOlder',
            },
          },
        },
      },
      ifFalse: 'Snap',
    },
  },
  $difficultyYounger: {
    operator: 'switch',
    matchExpression: {
      operator: 'objProps',
      property: 'preferredDifficulty',
    },
    easy: 'Go Fish',
    challenging: 'Rummy',
    hard: 'Rummy',
  },
  $difficultyOlder: {
    operator: 'match',
    matchExpression: {
      operator: 'objProps',
      property: 'preferredDifficulty',
    },
    easy: 'Rummy',
    challenging: '500',
    hard: '500',
  },
}

test('Card Game Decision Tree - single player 7+', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 1,
        ageOfYoungestPlayer: 12,
        preferredDifficulty: 'easy',
      },
    })
    .then((result: any) => {
      expect(result).toBe('Solitaire')
    })
})

test('Card Game Decision Tree - single player under 7', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 1,
        ageOfYoungestPlayer: 5,
        preferredDifficulty: 'easy',
      },
    })
    .then((result: any) => {
      expect(result).toBe('No recommendations 😔')
    })
})

test('Card Game Decision Tree - multiple players, some under 5', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 3,
        ageOfYoungestPlayer: 4,
        preferredDifficulty: 'easy',
      },
    })
    .then((result: any) => {
      expect(result).toBe('Snap')
    })
})

test('Card Game Decision Tree - multiple players, 5-8', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 2,
        ageOfYoungestPlayer: 5,
        preferredDifficulty: 'easy',
      },
    })
    .then((result: any) => {
      expect(result).toBe('Go Fish')
    })
})

test('Card Game Decision Tree - multiple players, 8-12, challenging game', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 2,
        ageOfYoungestPlayer: 9,
        preferredDifficulty: 'challenging',
      },
    })
    .then((result: any) => {
      expect(result).toBe('Rummy')
    })
})

test('Card Game Decision Tree - multiple players, 12-16, easy game', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 4,
        ageOfYoungestPlayer: 12,
        preferredDifficulty: 'easy',
      },
    })
    .then((result: any) => {
      expect(result).toBe('Rummy')
    })
})

test('Card Game Decision Tree - 3 players, 16+, challenging game', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 3,
        ageOfYoungestPlayer: 18,
        preferredDifficulty: 'challenging',
      },
    })
    .then((result: any) => {
      expect(result).toBe('500')
    })
})

test('Card Game Decision Tree - 4 players, 16+, challenging game', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 4,
        ageOfYoungestPlayer: 16,
        preferredDifficulty: 'challenging',
      },
    })
    .then((result: any) => {
      expect(result).toBe('500')
    })
})

test('Card Game Decision Tree - 4 players, 16+, hard game', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 4,
        ageOfYoungestPlayer: 16,
        preferredDifficulty: 'hard',
      },
    })
    .then((result: any) => {
      expect(result).toBe('Bridge')
    })
})

test('Card Game Decision Tree - No match error', () => {
  return exp
    .evaluate(decisionTree, {
      data: {
        numberOfPlayers: 4,
        ageOfYoungestPlayer: 16,
        preferredDifficulty: 'other',
      },
      returnErrorAsString: true,
    })
    .then((result: any) => {
      expect(result).toBe('Operator: MATCH\nNo match found for other')
    })
})
