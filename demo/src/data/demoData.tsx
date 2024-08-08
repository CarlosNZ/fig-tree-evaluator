import { EvaluatorNode } from 'fig-tree-evaluator'

interface DemoData {
  name: string
  content: string // Markdown
  objectData: object
  expression: EvaluatorNode
  descriptionDisplayPos: 'left' | 'right'
}

export const demoData: DemoData[] = [
  {
    name: 'Basic data fetching',
    content: `
# Basic data fetching

Welcome to **FigTree Evaluator**
`,
    descriptionDisplayPos: 'right',
    objectData: {
      user: {
        id: 2,
        firstName: 'Steve',
        lastName: 'Rogers',
        title: 'The First Avenger',
      },
      organisation: {
        id: 1,
        name: 'The Avengers',
        category: 'Superheroes',
      },
      form: {
        q1: 'Thor',
        q2: 'Asgard',
      },
      form2: {
        q1: 'Company Registration',
        q2: 'XYZ Chemicals',
      },
      application: {
        questions: {
          q1: 'What is the answer?',
          q2: 'Enter your name',
        },
      },
    },
    expression: {
      operator: '+',
      values: [
        { operator: 'getData', property: 'user.firstName' },
        ' ',
        { operator: 'getData', property: 'user.lastName' },
      ],
    },
  },
  {
    name: 'Decision Tree',
    content: '# Test',
    descriptionDisplayPos: 'left',
    objectData: {
      numberOfPlayers: 1,
      ageOfYoungestPlayer: 12,
      preferredDifficulty: 'easy',
    },
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  match: { operator: 'objProps', property: 'numberOfPlayers' },
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
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
  },
  {
    name: 'City list from country selection',
    content: '# TO-DO',
    objectData: {
      userResponses: { name: 'Mohini', country: 'India' },
    },
    expression: {
      operator: 'post',
      url: 'https://countriesnow.space/api/v0.1/countries/cities',
      returnProperty: 'data',
      parameters: {
        country: {
          $getData: 'userResponses.country',
        },
      },
    },
    descriptionDisplayPos: 'right',
  },
  {
    name: 'Complex string substitution',
    content: '# TO-DO',
    objectData: {
      user: {
        name: {
          first: 'Natasha',
          last: 'Romanoff',
        },
        country: 'Russia',
        friends: ['Steve', 'Bruce', 'Tony'],
        gender: 'female',
      },
    },
    expression: {
      operator: 'stringSubstitution',
      string:
        "This applicant's name is {{user.name.first}} {{user.name.last}}. {{genderLives}} in {{user.country}}, where the capital city is {{capital}}. {{genderHas}} {{friendCount}}.",
      replacements: {
        capital: {
          operator: 'get',
          url: {
            operator: '+',
            values: ['https://restcountries.com/v3.1/name/', { $getData: 'user.country' }],
          },
          returnProperty: '[0].capital[0]',
          fallback: 'unknown',
        },
        friendCount: { operator: 'count', values: { $getData: 'user.friends' } },
        genderLives: {
          operator: 'match',
          matchExpression: { $getData: 'user.gender' },
          branches: { female: 'She lives', male: 'He lives' },
          fallback: 'They live',
        },
        genderHas: {
          operator: 'match',
          matchExpression: { $getData: 'user.gender' },
          branches: { female: 'She has', male: 'He has' },
          fallback: 'They have',
        },
      },
      numberMap: {
        friendCount: {
          '0': 'no friends 😢',
          '1': 'only one friend',
          other: '{} friends',
          '>4': 'loads of friends',
        },
      },
    },
    descriptionDisplayPos: 'right',
  },
]
