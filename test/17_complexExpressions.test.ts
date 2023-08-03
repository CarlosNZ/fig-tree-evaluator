import { Client } from 'pg'
import { FigTreeEvaluator } from '../src'
import pgConfig from './postgres/pgConfig.json'
import massiveQuery from './massiveQuery.json'
import { config } from '../codegen/queryBuilder'

const pgConnect = new Client(pgConfig)
pgConnect.connect()

const exp = new FigTreeEvaluator({
  pgConnection: pgConnect,
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
  objects: {
    randomWords: ['starfield', 'spaceships', 'planetary', ['DEATH STAR']],
    organisation: 'Galactic Empire',
    longSentence: {
      '🇨🇺': "Rebel spies managed to steal secret plans to the Empire's ultimate weapon",
    },
    Oceania: { NZ: { Wellington: 'stolen plans that can save her people' } },
  },
  functions: { getPrincess: (name: string) => `Princess ${name}` },
  fragments: { doubleLineBreak: { $plus: ['\n', '\n'] } },
  returnErrorAsString: true,
  allowJSONStringInput: true,
})

test('Input is an array -- each item will be evaluated', () => {
  return exp
    .evaluate(
      [
        {
          operator: '+',
          values: [6, 7, 8],
        },
        {
          operator: 'objectProperties',
          property: 'name',
        },
        {
          operator: '!=',
          children: [6, 'tree'],
        },
      ],
      { objects: { name: 'Percy' } }
    )
    .then((result) => {
      expect(result).toStrictEqual([21, 'Percy', true])
    })
})

test('"values" is an evaluator expression, should evaluate to standard values array', () => {
  return exp
    .evaluate({
      operator: 'and',
      values: {
        operator: '+',
        values: [['this'], ['that']],
      },
    })
    .then((result) => {
      expect(result).toStrictEqual(true)
    })
})

test('"children" is an evaluator expression, should evaluate to standard child array', () => {
  return exp
    .evaluate({
      operator: 'objectProperties',
      children: {
        operator: '+',
        outputType: 'array',
        values: ['randomWords.', '[2]'],
      },
    })
    .then((result) => {
      expect(result).toStrictEqual('planetary')
    })
})

test('"children" is an evaluator expression but doesn\'t return an array', () => {
  return exp
    .evaluate({
      operator: 'objectProperties',
      children: {
        operator: '+',
        values: ['randomWords.', '[2]'],
      },
    })
    .then((result) => {
      expect(result).toStrictEqual(
        'Operator: OBJECT_PROPERTIES\n- Property "children" is not of type: array'
      )
    })
})

// Mother of all expressions
const expression = {
  $bypass: {
    operator: 'passThru',
    value: {
      operator: 'split',
      value: 'robot, ,fury',
      delimiter: ',',
      trimWhitespace: false,
    },
    type: 'number',
  },
  $country: {
    operator: 'API',
    children: [
      {
        operator: '+',
        children: ['https://restcountries.com/v3.1/name/', 'cuba'],
      },
      { operator: 'split', value: 'fullText, fields', delimiter: ',' },
      true,
      'name,capital,flag',
      'flag',
    ],
    type: 'string',
  },
  operator: '+',
  values: [
    {
      operator: 'stringSubstitution',
      children: [
        'It is a period of %1. Rebel %2, striking from a hidden base, have won their first victory against the evil %3.',
        {
          operator: '?',
          children: [
            {
              operator: '=',
              values: [
                {
                  operator: 'pg',
                  query: 'SELECT country FROM customers WHERE postal_code = $1',
                  values: [
                    {
                      operator: 'pgSQL',
                      children: ['(SELECT MAX(postal_code) from customers)'],
                      type: 'string',
                    },
                  ],
                  type: 'string',
                },
                'UK',
              ],
            },
            { operator: '_', _: ['civil war'], type: 'string' },
            '$bypass',
          ],
        },
        {
          operator: 'getProperty',
          property: {
            operator: 'substitute',
            children: [
              'randomWords[%99]',
              {
                operator: 'And',
                values: [
                  {
                    operator: 'REGEX',
                    pattern: 'A.+roa',
                    testString: {
                      operator: 'get',
                      url: 'https://restcountries.com/v3.1/alpha',
                      parameters: {
                        codes: 'nz',
                      },
                      returnProperty: '[0].name.nativeName.mri.official',
                    },
                  },
                  {
                    operator: 'ne',
                    values: [
                      {
                        operator: '+',
                        values: [6.66, 3.33],
                      },
                      10,
                    ],
                  },
                ],
                type: 'number',
              },
            ],
          },
        },
        {
          operator: 'objectProperties',
          children: ['organisation'],
        },
      ],
    },
    { fragment: 'doubleLineBreak' },
    {
      operator: 'SUBSTITUTE',
      string:
        'During the battle, %1, the %2, an armored space station with enough power to destroy an entire planet.',
      substitutions: [
        {
          operator: 'objectProperties',
          property: {
            operator: '+',
            values: ['longSentence.', '$country'],
          },
        },
        {
          $wordString: 'randomWords[3]',
          operator: 'objProps',
          property: '$wordString',
        },
      ],
    },
    { fragment: 'doubleLineBreak' },
    {
      $myFallback: 'Empire',
      operator: 'string_substitution',
      string:
        "Pursued by the {{enemy}}'s sinister agents, {{who}} races home aboard her starship, custodian of the {{what}} and restore freedom to the galaxy....",
      substitutions: {
        who: { operator: 'functions', functionPath: 'getPrincess', args: ['Leia'] },
        what: {
          operator: 'objProps',
          property: {
            operator: 'substitute',
            string: 'Oceania.NZ.%1',
            substitutions: [
              {
                operator: 'gql',
                query:
                  'query capitals($code:String!) {countries(filter: {code: {eq: $code}}) {capital}}',
                variables: { operator: 'buildObject', properties: [{ key: 'code', value: 'NZ' }] },
                returnNode: 'countries',
              },
            ],
          },
        },
        enemy: {
          operator: 'objProps',
          property: 'cant.find.this',
          fallback: '$myFallback',
        },
      },
    },
  ],
}

test('Massive nested query!', () => {
  exp.updateOptions({ evaluateFullObject: true })
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(
      "It is a period of civil war. Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire.\n\nDuring the battle, Rebel spies managed to steal secret plans to the Empire's ultimate weapon, the DEATH STAR, an armored space station with enough power to destroy an entire planet.\n\nPursued by the Empire's sinister agents, Princess Leia races home aboard her starship, custodian of the stolen plans that can save her people and restore freedom to the galaxy...."
    )
  })
})

const jsonExpression = `{"$bypass":{"operator":"passThru","value":{"operator":"split","value":"robot, ,fury","delimiter":",","trimWhitespace":false},"type":"number"},"$country":{"operator":"API","children":[{"operator":"+","children":["https://restcountries.com/v3.1/name/","cuba"]},{"operator":"split","value":"fullText, fields","delimiter":","},true,"name,capital,flag","flag"],"type":"string"},"operator":"+","values":[{"operator":"stringSubstitution","children":["It is a period of %1. Rebel %2, striking from a hidden base, have won their first victory against the evil %3.",{"operator":"?","children":[{"operator":"=","values":[{"operator":"pg","query":"SELECT country FROM customers WHERE postal_code = $1","values":[{"operator":"pgSQL","children":["(SELECT MAX(postal_code) from customers)"],"type":"string"}],"type":"string"},"UK"]},{"operator":"_","_":["civil war"],"type":"string"},"$bypass"]},{"operator":"getProperty","property":{"operator":"substitute","children":["randomWords[%99]",{"operator":"And","values":[{"operator":"REGEX","pattern":"A.+roa","testString":{"operator":"get","url":"https://restcountries.com/v3.1/alpha","parameters":{"codes":"nz,au"},"returnProperty":"[1].name.nativeName.mri.official"}},{"operator":"ne","values":[{"operator":"+","values":[6.66,3.33]},10]}],"type":"number"}]}},{"operator":"objectProperties","children":["organisation"]}]},{"fragment":"doubleLineBreak"},{"operator":"SUBSTITUTE","string":"During the battle, %1, the %2, an armored space station with enough power to destroy an entire planet.","substitutions":[{"operator":"objectProperties","property":{"operator":"+","values":["longSentence.","$country"]}},{"$wordString":"randomWords[3]","operator":"objProps","property":"$wordString"}]},{"fragment":"doubleLineBreak"},{"$myFallback":"Empire","operator":"string_substitution","string":"Pursued by the {{enemy}}'s sinister agents, {{who}} races home aboard her starship, custodian of the {{what}} and restore freedom to the galaxy....","substitutions":{"who":{"operator":"functions","functionPath":"getPrincess","args":["Leia"]},"what":{"operator":"objProps","property":{"operator":"substitute","string":"Oceania.NZ.%1","substitutions":[{"operator":"gql","query":"query capitals($code:String!) {countries(filter: {code: {eq: $code}}) {capital}}","variables":{"operator":"buildObject","properties":[{"key":"code","value":"NZ"}]},"returnNode":"countries"}]}},"enemy":{"operator":"objProps","property":"cant.find.this","fallback":"$myFallback"}}}]}`

test('Massive nested query as JSON string', () => {
  return exp.evaluate(jsonExpression).then((result) => {
    expect(result).toBe(
      "It is a period of civil war. Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire.\n\nDuring the battle, Rebel spies managed to steal secret plans to the Empire's ultimate weapon, the DEATH STAR, an armored space station with enough power to destroy an entire planet.\n\nPursued by the Empire's sinister agents, Princess Leia races home aboard her starship, custodian of the stolen plans that can save her people and restore freedom to the galaxy...."
    )
  })
})

// Same expression but utilising some shorthand expressions
const shorthandExpression = {
  $bypass: {
    operator: 'passThru',
    value: {
      $split: { value: 'robot, ,fury', delimiter: ',', trimWhitespace: false },
    },
    type: 'number',
  },
  $country: {
    $API: [
      '$plus(https://restcountries.com/v3.1/name/, cuba)',
      { $split: { value: 'fullText, fields', delimiter: ',' } },
      true,
      'name,capital,flag',
      'flag',
    ],
    type: 'string',
  },
  $plus: [
    {
      $stringSubstitution: [
        'It is a period of %1. Rebel %2, striking from a hidden base, have won their first victory against the evil %3.',
        {
          $conditional: [
            {
              $eq: [
                {
                  $pg: {
                    query: 'SELECT country FROM customers WHERE postal_code = $1',
                    values: [
                      { $pgSQL: ['(SELECT MAX(postal_code) from customers)'], type: 'string' },
                    ],
                  },
                  type: 'string',
                },
                'UK',
              ],
            },
            { $_: ['civil war'], type: 'string' },
            '$bypass',
          ],
        },
        {
          $getProperty: {
            $substitute: [
              'randomWords[%99]',
              {
                $And: [
                  {
                    $regex: {
                      pattern: 'A.+roa',
                      testString: {
                        $get: [
                          'https://restcountries.com/v3.1/alpha',
                          'codes',
                          'nz,au',
                          '[1].name.nativeName.mri.official',
                        ],
                      },
                    },
                  },
                  { $ne: [{ $plus: [6.66, 3.33] }, 10] },
                ],
                type: 'number',
              },
            ],
          },
        },
        '$getData(organisation)',
      ],
    },
    { $doubleLineBreak: {} },
    {
      $substitute: [
        'During the battle, %1, the %2, an armored space station with enough power to destroy an entire planet.',
        { $getData: { $plus: ['longSentence.', '$country'] } },
        { $getData: '$wordString', $wordString: 'randomWords[3]' },
        null,
      ],
    },
    '$doubleLineBreak()',
    {
      $myFallback: 'Empire',
      $stringSubstitution: {
        string:
          "Pursued by the {{enemy}}'s sinister agents, {{who}} races home aboard her starship, custodian of the {{what}} and restore freedom to the galaxy....",
        replacements: {
          who: { $functions: ['getPrincess', 'Leia'] },
          what: {
            $objProps: {
              $substitute: {
                string: 'Oceania.NZ.%1',
                substitutions: [
                  {
                    $gql: {
                      query:
                        'query capitals($code:String!) {countries(filter: {code: {eq: $code}}) {capital}}',
                      variables: '$buildObject(code, NZ)',
                      returnNode: 'countries',
                    },
                  },
                ],
              },
            },
          },
          enemy: { $objProps: 'cant.find.this', fallback: '$myFallback' },
        },
      },
    },
  ],
}

test('Massive nested query in shorthand', () => {
  return exp.evaluate(shorthandExpression).then((result) => {
    expect(result).toBe(
      "It is a period of civil war. Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire.\n\nDuring the battle, Rebel spies managed to steal secret plans to the Empire's ultimate weapon, the DEATH STAR, an armored space station with enough power to destroy an entire planet.\n\nPursued by the Empire's sinister agents, Princess Leia races home aboard her starship, custodian of the stolen plans that can save her people and restore freedom to the galaxy...."
    )
  })
})

// HUUUUGE auto-generated query
test('Process an enormous auto-generated query', () => {
  return exp.evaluate(massiveQuery, config).then((result) => {
    expect(result).toBe('This sentence has too many missing words')
  })
})

// Close PG connection so script can exit
afterAll(() => {
  pgConnect.end()
})
