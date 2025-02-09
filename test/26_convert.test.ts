import { FetchClient } from '../src'
import fetch from 'node-fetch'
import { convertV1ToV2, convertToShorthand } from '../src/convert'
import { FigTreeEvaluator } from './evaluator'
import { convertFromShorthand } from '../src/convert/fromShorthand'

const fig = new FigTreeEvaluator({
  httpClient: FetchClient(fetch),
  functions: {
    random: () => Math.random(),
    square: (n: number) => n * n,
    getSomething: (a, b) => a + b,
    reverse: {
      function: (input: unknown[] | string) => {
        if (Array.isArray(input)) return [...input].reverse()
        return input.split('').reverse().join('')
      },
      description: 'Reverse a string or array',
      argsDefault: ['Reverse Me'],
    },
    fDouble: (...args: number[]) => args.map((e) => e + e),
    getFullName: (nameObject: { firstName: string; lastName: string }) => {
      return `${nameObject.firstName} ${nameObject.lastName}`
    },
    changeCase: {
      function: ({ string, toCase }: { string: string; toCase: 'lower' | 'upper' }) =>
        toCase === 'upper' ? string.toUpperCase() : string.toLowerCase(),
      description: 'Convert a string to either upper or lower case',
      inputDefault: { string: 'New string', toCase: 'upper' },
    },
    currentDate: {
      function: () => new Date().toLocaleDateString(),
      description: "Returns today's date in local format",
    },
  },
  fragments: {
    getCapital: {
      operator: 'GET',
      url: {
        operator: 'stringSubstitution',
        string: 'https://restcountries.com/v3.1/name/%1',
        replacements: ['$country'],
      },
      returnProperty: '[0].capital',
      outputType: 'string',
      metadata: {
        description: "Gets a country's capital city",
        parameters: [
          {
            name: '$country',
            type: 'string',
            required: true,
          },
        ],
      },
    },
    getRandom: { $function: 'random' },
    getFlag: {
      operator: 'GET',
      children: [
        {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        [],
        'flag',
      ],
      outputType: 'string',
    },
    adder: { operator: '+', values: '$values' },
  },
  data: {
    applicationData: { applicationSerial: 'X12345', firstName: 'Tom', lastName: 'Holland' },
    film: { title: 'Deadpool & Wolverine', minAgeRating: 17 },
    patron: { age: 12, isParentAttending: true },
    myCountry: 'Morocco',
    backwardsInput: " :si etad s'yadoT",
    toCase: 'upper',
  },
})

test('Convert to V2 -- basic', async () => {
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
  const result = {
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
  }
  const v2exp = await convertV1ToV2(expression, fig)
  expect(v2exp).toStrictEqual(result)
  const v1Eval = await fig.evaluate(expression)
  const v2Eval = await fig.evaluate(v2exp)
  expect(v1Eval).toStrictEqual(v2Eval)
})

test('Convert to V2 -- more complex', async () => {
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
  const result = {
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
  }
  const v2exp = await convertV1ToV2(expression, fig)
  expect(v2exp).toStrictEqual(result)
  const v1Eval = await fig.evaluate(expression)
  const v2Eval = await fig.evaluate(v2exp)
  expect(v1Eval).toStrictEqual(v2Eval)
})

test('Convert to V2 -- String Substitution', async () => {
  const expression = {
    children: [
      '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
      { children: ['applicationData.applicationSerial', null], operator: 'objectProperties' },
      { children: ['applicationData.firstName', null], operator: 'objectProperties' },
      { children: ['applicationData.lastName', '  '], operator: 'objectProperties' },
      {
        operator: 'GraphQL',
        children: [
          'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
          'https://countries.trevorblades.com/',
          [],
        ],
      },
    ],
    operator: 'stringSubstitution',
  }
  const result = {
    operator: 'stringSubstitution',
    string:
      '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
    substitutions: [
      { operator: 'getData', property: 'applicationData.applicationSerial', fallback: null },
      { operator: 'getData', property: 'applicationData.firstName', fallback: null },
      { operator: 'getData', property: 'applicationData.lastName', fallback: '  ' },
      {
        operator: 'graphQL',
        query:
          'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
        url: 'https://countries.trevorblades.com/',
        variables: {},
      },
    ],
  }
  const v2exp = await convertV1ToV2(expression, fig)
  expect(v2exp).toStrictEqual(result)
  const v1Eval = await fig.evaluate(expression)
  const v2Eval = await fig.evaluate(v2exp)
  expect(v1Eval).toStrictEqual(v2Eval)
})

test('Convert to V2 -- trickier operators', async () => {
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
  const result = {
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
          operator: 'GET',
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
  }
  const v2exp = await convertV1ToV2(expression, fig)
  expect(v2exp).toStrictEqual(result)
  const v1Eval = await fig.evaluate(expression)
  const v2Eval = await fig.evaluate(v2exp)
  expect(v1Eval).toStrictEqual(v2Eval)
})

test('Convert to V2 -- already partially converted', async () => {
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
  const result = {
    operator: '?',
    $getNZ: {
      operator: 'GET',
      outputType: 'string',
      url: 'https://restcountries.com/v3.1/name/zealand',
      parameters: {},
      returnProperty: 'name.common',
    },
    condition: {
      operator: '!=',
      values: ['$getNZ', null],
    },
    valueIfTrue: '$getNZ',
    valueIfFalse: 'Not New Zealand',
  }
  const v2exp = await convertV1ToV2(expression, fig)
  expect(v2exp).toStrictEqual(result)
  const v1Eval = await fig.evaluate(expression)
  const v2Eval = await fig.evaluate(v2exp)
  expect(v1Eval).toStrictEqual(v2Eval)
})

// Convert TO Shorthand

test('Convert to Shorthand -- basic', async () => {
  const expression = {
    operator: 'stringSubstitution',
    string:
      '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
    substitutions: [
      { operator: 'getData', property: 'applicationData.applicationSerial', fallback: null },
      { operator: 'getData', property: 'applicationData.firstName', fallback: null },
      { operator: 'getData', property: 'applicationData.lastName', fallback: '  ' },
      {
        operator: 'graphQL',
        query:
          'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
        url: 'https://countries.trevorblades.com/',
        variables: {},
      },
    ],
  }
  const result = {
    $stringSubstitution: {
      string:
        '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
      substitutions: [
        { $getData: ['applicationData.applicationSerial', null] },
        { $getData: ['applicationData.firstName', null] },
        { $getData: ['applicationData.lastName', '  '] },
        {
          $graphQL: {
            query:
              'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
            url: 'https://countries.trevorblades.com/',
            variables: {},
          },
        },
      ],
    },
  }
  const shorthand = await convertToShorthand(expression, fig)
  expect(shorthand).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const shorthandEval = await fig.evaluate(shorthand)
  expect(origEval).toStrictEqual(shorthandEval)
})
test('Convert to Shorthand -- bigger, with some nodes already shorthand', async () => {
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
  const result = {
    $conditional: {
      condition: {
        $or: [
          {
            $greaterThan: {
              values: [{ $getData: 'patron.age' }, { $getData: 'film.minAgeRating' }],
              strict: false,
            },
          },
          {
            $and: [
              { $greaterThan: { values: [{ $getData: 'patron.age' }, 13], strict: false } },
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
  }

  const shorthand = await convertToShorthand(expression, fig)
  expect(shorthand).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const shorthandEval = await fig.evaluate(shorthand)
  expect(origEval).toStrictEqual(shorthandEval)
})

test('Convert to Shorthand -- fragments', async () => {
  const expression = {
    operator: '+',
    values: [
      { fragment: 'adder', $values: [7, 8, 9] },
      {
        fragment: 'adder',
        parameters: {
          $values: [
            { fragment: 'getFlag', $country: 'New Zealand' },
            {
              fragment: 'getFlag',
              parameters: { $country: { operator: 'getData', property: 'myCountry' } },
            },
          ],
        },
      },
    ],
    type: 'array',
  }
  const result = {
    $plus: {
      values: [
        { $adder: { $values: [7, 8, 9] } },
        {
          $adder: {
            $values: [
              { $getFlag: { $country: 'New Zealand' } },
              { $getFlag: { $country: { $getData: 'myCountry' } } },
            ],
          },
        },
      ],
      type: 'array',
    },
  }
  const shorthand = await convertToShorthand(expression, fig)
  expect(shorthand).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const shorthandEval = await fig.evaluate(shorthand)
  expect(origEval).toStrictEqual(shorthandEval)
})

test('Convert to Shorthand -- normal node with Fallback', async () => {
  const expression = {
    operator: 'and',
    values: [
      { operator: '>', values: [{ $getData: 'patron.age' }, 13] },
      { $getData: 'patron.isParentAttending' },
    ],
    fallback: 'This should show up',
  }
  const result = {
    $and: {
      values: [
        { $greaterThan: [{ $getData: 'patron.age' }, 13] },
        { $getData: 'patron.isParentAttending' },
      ],
      fallback: 'This should show up',
    },
  }
  const shorthand = await convertToShorthand(expression, fig)
  expect(shorthand).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const shorthandEval = await fig.evaluate(shorthand)
  expect(origEval).toStrictEqual(shorthandEval)
})

test('Convert to Shorthand -- lots of node types', async () => {
  const expression = [
    {
      operator: 'buildObject',
      values: ['someKey', { operator: '+', values: [1, 2, 3] }],
    },
    {
      operator: 'buildObject',
      values: [
        {
          key: 'someKey',
          value: { operator: 'objProps', property: 'testing.this', fallback: 'Internal' },
        },
      ],
      fallback: 'Okay then',
    },
    {
      operator: 'length',
      values: [
        'someKey',
        { operator: '+', values: [1, 2, 3], useCache: true, outputType: 'array' },
      ],
    },
    {
      operator: '=',
      values: [
        { operator: 'equals', values: [1, 1, 2] },
        { operator: 'eq', values: ['word', 'WORD'], caseInsensitive: true, fallback: 'Ooops' },
        { operator: 'equal', values: [null, undefined], nullEqualsUndefined: true },
      ],
    },
    {
      operator: '?',
      $getNZ: {
        operator: 'GET',
        url: 'https://restcountries.com/v3.1/name/zealand',
        returnProperty: 'name.common',
        outputType: 'string',
      },
      condition: {
        operator: '!=',
        values: ['$getNZ', null],
      },
      valueIfTrue: '$getNZ',
      valueIfFalse: 'Not New Zealand',
    },
    {
      operator: 'passThru',
      value: { operator: 'PASS_THRU', value: [1, 2, { operator: 'pass', value: 'ONE' }] },
    },
    {
      operator: 'Match',
      match: { operator: 'getData', property: 'film.title' },
      branches: {
        'Deadpool & Wolverine': {
          operator: 'match',
          matchExpression: {
            operator: 'getData',
            property: 'film.minAgeRating',
          },
          69: 'Nope',
          17: 'OKAY',
        },
        Other: 420,
      },
    },
  ]
  const result = [
    { $buildObject: ['someKey', { $plus: [1, 2, 3] }] },
    {
      $buildObject: {
        values: [{ key: 'someKey', value: { $getData: ['testing.this', 'Internal'] } }],
        fallback: 'Okay then',
      },
    },
    { $count: ['someKey', { $plus: { values: [1, 2, 3], useCache: true, outputType: 'array' } }] },
    {
      $eq: [
        { $eq: [1, 1, 2] },
        { $eq: { values: ['word', 'WORD'], caseInsensitive: true, fallback: 'Ooops' } },
        { $eq: { values: [null, undefined], nullEqualsUndefined: true } },
      ],
    },
    {
      $conditional: {
        condition: { $notEqual: ['$getNZ', null] },
        valueIfTrue: '$getNZ',
        valueIfFalse: 'Not New Zealand',
      },
      $getNZ: {
        $GET: {
          url: 'https://restcountries.com/v3.1/name/zealand',
          returnProperty: 'name.common',
          outputType: 'string',
        },
      },
    },
    { $pass: { $pass: { value: [1, 2, { $pass: 'ONE' }] } } },
    {
      $match: {
        match: { $getData: 'film.title' },
        branches: {
          'Deadpool & Wolverine': {
            $match: {
              '17': 'OKAY',
              '69': 'Nope',
              matchExpression: { $getData: 'film.minAgeRating' },
            },
          },
          Other: 420,
        },
      },
    },
  ]
  const shorthand = await convertToShorthand(expression, fig)
  expect(shorthand).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const shorthandEval = await fig.evaluate(shorthand)
  expect(origEval).toStrictEqual(shorthandEval)
})

test('Convert to Shorthand -- Custom operators/functions', async () => {
  const expression = {
    operator: 'changeCase',
    toCase: { operator: 'getData', property: 'toCase' },
    string: {
      operator: '+',
      values: [
        { operator: 'reverse', args: [{ operator: 'getData', property: 'backwardsInput' }] },
        { operator: 'currentDate' },
        { operator: 'reverse', input: [1, 2, 3, 4] },
      ],
    },
  }
  const result = {
    $changeCase: {
      toCase: { $getData: 'toCase' },
      string: {
        $plus: [
          { $reverse: [{ $getData: 'backwardsInput' }] },
          { $currentDate: {} },
          { $reverse: { input: [1, 2, 3, 4] } },
        ],
      },
    },
  }
  const shorthand = await convertToShorthand(expression, fig)
  expect(shorthand).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const shorthandEval = await fig.evaluate(shorthand)
  expect(origEval).toStrictEqual(shorthandEval)
})

// Convert FROM Shorthand -- these are all (essentially) the reverse of the
// above

test('Convert from Shorthand -- basic', async () => {
  const expression = {
    $stringSubstitution: {
      string:
        '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
      substitutions: [
        { $getData: ['applicationData.applicationSerial', null] },
        { $getData: ['applicationData.firstName', null] },
        { $getData: ['applicationData.lastName', '  '] },
        {
          $graphQL: {
            query:
              'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
            url: 'https://countries.trevorblades.com/',
            variables: {},
          },
        },
      ],
    },
  }
  const result = {
    operator: 'stringSubstitution',
    string:
      '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
    substitutions: [
      { operator: 'getData', property: 'applicationData.applicationSerial', fallback: null },
      { operator: 'getData', property: 'applicationData.firstName', fallback: null },
      { operator: 'getData', property: 'applicationData.lastName', fallback: '  ' },
      {
        operator: 'graphQL',
        query:
          'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
        url: 'https://countries.trevorblades.com/',
        variables: {},
      },
    ],
  }
  const full = await convertFromShorthand(expression, fig)
  expect(full).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const fullEval = await fig.evaluate(full)
  expect(origEval).toStrictEqual(fullEval)
})

test('Convert from Shorthand -- bigger, with lots of conditional logic', async () => {
  const expression = {
    $conditional: {
      condition: {
        $or: [
          {
            $greaterThan: {
              values: [{ $getData: 'patron.age' }, { $getData: 'film.minAgeRating' }],
              strict: false,
            },
          },
          {
            $and: [
              { $greaterThan: { values: [{ $getData: 'patron.age' }, 13], strict: false } },
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
  }
  const result = {
    operator: '?',
    condition: {
      operator: 'or',
      values: [
        {
          operator: '>',
          values: [
            { operator: 'getData', property: 'patron.age' },
            { operator: 'getData', property: 'film.minAgeRating' },
          ],
          strict: false,
        },
        {
          operator: 'and',
          values: [
            {
              operator: '>',
              values: [{ operator: 'getData', property: 'patron.age' }, 13],
              strict: false,
            },
            { operator: 'getData', property: 'patron.isParentAttending' },
          ],
        },
      ],
    },
    valueIfTrue: {
      operator: 'stringSubstitution',
      string: 'Enjoy "{{movie}}"! 🍿🎬',
      substitutions: [{ movie: { operator: 'getData', property: 'film.title' } }],
    },
    valueIfFalse: "Sorry, try again when you're older 😔",
  }

  const full = await convertFromShorthand(expression, fig)
  expect(full).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const fullEval = await fig.evaluate(full)
  expect(origEval).toStrictEqual(fullEval)
})

test('Convert from Shorthand -- fragments', async () => {
  const expression = {
    $plus: {
      values: [
        { $adder: { $values: [7, 8, 9] } },
        {
          $adder: {
            $values: [
              { $getFlag: { $country: 'New Zealand' } },
              { $getFlag: { $country: { $getData: 'myCountry' } } },
            ],
          },
        },
      ],
      type: 'array',
    },
  }
  const result = {
    operator: '+',
    values: [
      { fragment: 'adder', $values: [7, 8, 9] },
      {
        fragment: 'adder',
        $values: [
          { fragment: 'getFlag', $country: 'New Zealand' },
          {
            fragment: 'getFlag',
            $country: { operator: 'getData', property: 'myCountry' },
          },
        ],
      },
    ],
    type: 'array',
  }
  const full = await convertFromShorthand(expression, fig)
  expect(full).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const fullEval = await fig.evaluate(full)
  expect(origEval).toStrictEqual(fullEval)
})

test('Convert from Shorthand -- normal node with Fallback', async () => {
  const expression = {
    $and: {
      values: [
        { $greaterThan: [{ $getData: 'patron.age' }, 13] },
        { $getData: 'patron.isParentAttending' },
      ],
      fallback: 'This should show up',
    },
  }
  const result = {
    operator: 'and',
    values: [
      { operator: '>', values: [{ operator: 'getData', property: 'patron.age' }, 13] },
      { operator: 'getData', property: 'patron.isParentAttending' },
    ],
    fallback: 'This should show up',
  }
  const full = await convertFromShorthand(expression, fig)
  expect(full).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const fullEval = await fig.evaluate(full)
  expect(origEval).toStrictEqual(fullEval)
})

test('Convert from Shorthand -- lots of node types', async () => {
  const expression = [
    { $buildObject: ['someKey', { $plus: [1, 2, 3] }] },
    {
      $buildObject: {
        values: [{ key: 'someKey', value: { $getData: ['testing.this', 'Internal'] } }],
        fallback: 'Okay then',
      },
    },
    { $count: ['someKey', { $plus: { values: [1, 2, 3], useCache: true, outputType: 'array' } }] },
    {
      $eq: [
        { $eq: [1, 1, 2] },
        { $eq: { values: ['word', 'WORD'], caseInsensitive: true, fallback: 'Ooops' } },
        { $eq: { values: [null, undefined], nullEqualsUndefined: true } },
      ],
    },
    {
      $conditional: {
        condition: { $notEqual: ['$getNZ', null] },
        valueIfTrue: '$getNZ',
        valueIfFalse: 'Not New Zealand',
      },
      $getNZ: {
        $GET: {
          url: 'https://restcountries.com/v3.1/name/zealand',
          returnProperty: 'name.common',
          outputType: 'string',
        },
      },
    },
    { $passThru: { $passThru: { value: [1, 2, { $passThru: 'ONE' }] } } },
    // {
    //   $match: {
    //     match: { $getData: 'film.title' },
    //     branches: {
    //       'Deadpool & Wolverine': {
    //         $match: {
    //           '17': 'OKAY',
    //           '69': 'Nope',
    //           matchExpression: { $getData: 'film.minAgeRating' },
    //         },
    //       },
    //       Other: 420,
    //     },
    //   },
    // },
  ]
  const result = [
    {
      operator: 'buildObject',
      properties: [
        {
          key: 'someKey',
          value: {
            operator: '+',
            values: [1, 2, 3],
          },
        },
      ],
    },
    {
      operator: 'buildObject',
      values: [
        {
          key: 'someKey',
          value: { operator: 'getData', property: 'testing.this', fallback: 'Internal' },
        },
      ],
      fallback: 'Okay then',
    },
    {
      operator: 'count',
      values: [
        'someKey',
        { operator: '+', values: [1, 2, 3], useCache: true, outputType: 'array' },
      ],
    },
    {
      operator: '=',
      values: [
        { operator: '=', values: [1, 1, 2] },
        { operator: '=', values: ['word', 'WORD'], caseInsensitive: true, fallback: 'Ooops' },
        { operator: '=', values: [null, undefined], nullEqualsUndefined: true },
      ],
    },
    {
      operator: '?',
      $getNZ: {
        operator: 'GET',
        url: 'https://restcountries.com/v3.1/name/zealand',
        returnProperty: 'name.common',
        outputType: 'string',
      },
      condition: {
        operator: '!=',
        values: ['$getNZ', null],
      },
      valueIfTrue: '$getNZ',
      valueIfFalse: 'Not New Zealand',
    },
    {
      operator: 'pass',
      value: { operator: 'pass', value: [1, 2, { operator: 'pass', value: 'ONE' }] },
    },
    // {
    //   operator: 'Match',
    //   match: { operator: 'getData', property: 'film.title' },
    //   branches: {
    //     'Deadpool & Wolverine': {
    //       operator: 'match',
    //       matchExpression: {
    //         operator: 'getData',
    //         property: 'film.minAgeRating',
    //       },
    //       69: 'Nope',
    //       17: 'OKAY',
    //     },
    //     Other: 420,
    //   },
    // },
  ]
  const full = await convertFromShorthand(expression, fig)
  expect(full).toStrictEqual(result)
  const origEval = await fig.evaluate(expression)
  const fullEval = await fig.evaluate(full)
  expect(origEval).toStrictEqual(fullEval)
})

// test('Convert to Shorthand -- Custom operators/functions', async () => {
//   const expression = {
//     operator: 'changeCase',
//     toCase: { operator: 'getData', property: 'toCase' },
//     string: {
//       operator: '+',
//       values: [
//         { operator: 'reverse', args: [{ operator: 'getData', property: 'backwardsInput' }] },
//         { operator: 'currentDate' },
//         { operator: 'reverse', input: [1, 2, 3, 4] },
//       ],
//     },
//   }
//   const result = {
//     $changeCase: {
//       toCase: { $getData: 'toCase' },
//       string: {
//         $plus: [
//           { $reverse: [{ $getData: 'backwardsInput' }] },
//           { $currentDate: {} },
//           { $reverse: { input: [1, 2, 3, 4] } },
//         ],
//       },
//     },
//   }
//   const shorthand = await convertToShorthand(expression, fig)
//   expect(shorthand).toStrictEqual(result)
//   const origEval = await fig.evaluate(expression)
//   const shorthandEval = await fig.evaluate(shorthand)
//   expect(origEval).toStrictEqual(shorthandEval)
// })
