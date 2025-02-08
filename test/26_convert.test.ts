import { convertV1ToV2, convertToShorthand } from '../src/convertors'
import { FigTreeEvaluator } from './evaluator'

const fig = new FigTreeEvaluator()

test('Convert to V2 -- basic', () => {
  const expression = {
    operator: 'AND',
    children: [
      {
        operator: '=',
        children: [
          {
            operator: 'objectProperties',
            children: ['responses.alreadyRegistered.optionIndex', null],
          },
          0,
        ],
      },
      {
        operator: '!=',
        children: [
          {
            operator: 'objectProperties',
            children: ['responses.provProdSelect.selection', null],
          },
          null,
        ],
      },
    ],
  }
  return convertV1ToV2(fig, expression).then((result) => {
    expect(result).toStrictEqual({
      operator: 'and',
      values: [
        {
          operator: '=',
          values: [
            {
              operator: 'getData',
              property: 'responses.alreadyRegistered.optionIndex',
              fallback: null,
            },
            0,
          ],
        },
        {
          operator: '!=',
          values: [
            {
              operator: 'getData',
              property: 'responses.provProdSelect.selection',
              fallback: null,
            },
            null,
          ],
        },
      ],
    })
  })
})

test('Convert to V2 -- more complex', () => {
  const expression = {
    children: [
      {
        children: [
          {
            children: [
              {
                children: ['responses.alreadyRegistered.optionIndex', null],
                operator: 'objectProperties',
              },
              0,
            ],
            operator: '=',
          },
          {
            children: [
              { children: ['responses.provProdSelect', null], operator: 'objectProperties' },
              null,
            ],
            operator: '!=',
          },
        ],
        operator: 'AND',
      },
      {
        children: ['responses.provProdSelect.selection.tradeName', null],
        operator: 'objectProperties',
      },
      {
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: ['responses.preregSelect.optionIndex', ''],
                    operator: 'objectProperties',
                  },
                  0,
                ],
                operator: '=',
              },
              {
                children: [
                  {
                    children: ['responses.preregSelect.optionIndex', ''],
                    operator: 'objectProperties',
                  },
                  1,
                ],
                operator: '=',
              },
            ],
            operator: 'OR',
          },
          {
            children: ['responses.prodSelect.selection[0].tradeName', null],
            operator: 'objectProperties',
          },
          null,
        ],
        operator: '?',
      },
    ],
    operator: '?',
  }
  return convertV1ToV2(fig, expression).then((result) => {
    expect(result).toStrictEqual({
      operator: '?',
      condition: {
        operator: 'and',
        values: [
          {
            operator: '=',
            values: [
              {
                operator: 'getData',
                property: 'responses.alreadyRegistered.optionIndex',
                fallback: null,
              },
              0,
            ],
          },
          {
            operator: '!=',
            values: [
              {
                operator: 'getData',
                property: 'responses.provProdSelect',
                fallback: null,
              },
              null,
            ],
          },
        ],
      },
      valueIfTrue: {
        operator: 'getData',
        property: 'responses.provProdSelect.selection.tradeName',
        fallback: null,
      },
      valueIfFalse: {
        operator: '?',
        condition: {
          operator: 'or',
          values: [
            {
              operator: '=',
              values: [
                {
                  operator: 'getData',
                  property: 'responses.preregSelect.optionIndex',
                  fallback: '',
                },
                0,
              ],
            },
            {
              operator: '=',
              values: [
                {
                  operator: 'getData',
                  property: 'responses.preregSelect.optionIndex',
                  fallback: '',
                },
                1,
              ],
            },
          ],
        },
        valueIfTrue: {
          operator: 'getData',
          property: 'responses.prodSelect.selection[0].tradeName',
          fallback: null,
        },
        valueIfFalse: null,
      },
    })
  })
})

test('Convert to V2 -- String Substitution', () => {
  const expression = {
    children: [
      '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
      {
        children: ['applicationData.applicationSerial', null],
        operator: 'objectProperties',
      },
      {
        children: ['applicationData.firstName', null],
        operator: 'objectProperties',
      },
      {
        children: ['applicationData.lastName', '  '],
        operator: 'objectProperties',
      },
      {
        children: [
          'query getRegAuth {organisation(id: 1) {name}}',
          'graphQLEndpoint',
          [],
          'organisation.name',
        ],
        operator: 'graphQL',
      },
    ],
    operator: 'stringSubstitution',
  }
  return convertV1ToV2(fig, expression).then((result) => {
    expect(result).toStrictEqual({
      operator: 'stringSubstitution',
      string:
        '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
      substitutions: [
        {
          operator: 'getData',
          property: 'applicationData.applicationSerial',
          fallback: null,
        },
        {
          operator: 'getData',
          property: 'applicationData.firstName',
          fallback: null,
        },
        {
          operator: 'getData',
          property: 'applicationData.lastName',
          fallback: '  ',
        },
        {
          operator: 'graphQL',
          query: 'query getRegAuth {organisation(id: 1) {name}}',
          url: 'graphQLEndpoint',
          variables: {},
          returnNode: 'organisation.name',
        },
      ],
    })
  })
})

test('Convert to V2 -- trickier operators', () => {
  const expression = {
    operator: 'buildObject',
    children: [
      'someKey',
      'someValue',
      { operator: 'objectFunctions', children: ['functions.getSomething', 'arg1', 'arg2'] },
      {
        operator: 'GET',
        children: [
          {
            operator: '+',
            children: ['https://restcountries.com/v3.1/name/', 'cuba'],
          },
          ['fullText', 'fields'],
          'true',
          'name,capital,flag',
          'capital',
        ],
        type: 'string',
      },
    ],
  }
  return convertV1ToV2(fig, expression).then((result) => {
    expect(result).toStrictEqual({
      operator: 'buildObject',
      properties: [
        {
          key: 'someKey',
          value: 'someValue',
        },
        {
          key: {
            operator: 'customFunctions',
            functionName: 'functions.getSomething',
            args: ['arg1', 'arg2'],
          },
          value: {
            operator: 'get',
            url: 'https://restcountries.com/v3.1/name/cuba',
            parameters: {
              fullText: 'true',
              fields: 'name,capital,flag',
            },
            returnProperty: 'capital',
            outputType: 'string',
          },
        },
      ],
    })
  })
})

// Convert to Shorthand

test('Convert to Shorthand -- basic', () => {
  const expression = {
    operator: 'stringSubstitution',
    string:
      '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
    substitutions: [
      {
        operator: 'getData',
        property: 'applicationData.applicationSerial',
        fallback: null,
      },
      {
        operator: 'getData',
        property: 'applicationData.firstName',
        fallback: null,
      },
      {
        operator: 'getData',
        property: 'applicationData.lastName',
      },
      {
        operator: 'graphQl',
        query: 'query getRegAuth {organisation(id: 1) {name}}',
        url: 'graphQLEndpoint',
        returnNode: 'organisation.name',
      },
    ],
  }
  expect(convertToShorthand(fig, expression)).toStrictEqual({
    $stringSubstitution: {
      string:
        '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
      substitutions: [
        {
          $getData: ['applicationData.applicationSerial', null],
        },
        {
          $getData: ['applicationData.firstName', null],
        },
        {
          $getData: 'applicationData.lastName',
        },
        {
          $graphQl: {
            query: 'query getRegAuth {organisation(id: 1) {name}}',
            url: 'graphQLEndpoint',
            returnNode: 'organisation.name',
          },
        },
      ],
    },
  })
})
test('Convert to Shorthand -- bigger, with some nodes already shorthand', () => {
  const expression = {
    operator: '?',
    condition: {
      operator: 'or',
      values: [
        {
          operator: '>',
          values: [{ $getData: 'patron.age' }, { $getData: 'film.minAgeRating' }],
          strict: false,
        },
        {
          operator: 'and',
          values: [
            { operator: '>', values: [{ $getData: 'patron.age' }, 13], strict: false },
            { $getData: 'patron.isParentAttending' },
          ],
        },
      ],
    },
    valueIfTrue: {
      operator: 'stringSubstitution',
      string: 'Enjoy "{{movie}}"! 🍿🎬',
      substitutions: { movie: { operator: 'getData', property: 'film.title' } },
    },
    valueIfFalse: "Sorry, try again when you're older 😔",
  }
  expect(convertToShorthand(fig, expression)).toStrictEqual({
    '$?': {
      condition: {
        $or: [
          {
            '$>': {
              values: [{ $getData: 'patron.age' }, { $getData: 'film.minAgeRating' }],
              strict: false,
            },
          },
          {
            $and: [
              { '$>': { values: [{ $getData: 'patron.age' }, 13], strict: false } },
              { $getData: 'patron.isParentAttending' },
            ],
          },
        ],
      },
      valueIfTrue: {
        $stringSubstitution: ['Enjoy "{{movie}}"! 🍿🎬', { movie: { $getData: 'film.title' } }],
      },
      valueIfFalse: "Sorry, try again when you're older 😔",
    },
  })
})
