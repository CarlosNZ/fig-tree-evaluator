import { FigTreeEvaluator } from './evaluator'

const fig = new FigTreeEvaluator({
  functions: {
    getPrincess: (name: string) => `Princess ${name}`,
    fDouble: (...args: number[]) => args.map((e) => e + e),
    fDate: {
      function: (dateString: string) => new Date(dateString),
      description: 'Turn a date string into a JS Date object',
      argsDefault: ['December 23, 1995 03:24:00'],
    },
    addTwo: { function: (n1: number, n2: number) => n1 + n2, inputDefault: { n1: 10, n2: 10 } },
    fNoArgs: { function: () => 5 * 5, description: 'Returns 10 🤷‍♂️' },
  },
  fragments: {
    getFlag: {
      name: 'GET',
      children: [
        {
          name: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        [],
        'flag',
      ],
      outputType: 'string',
      metadata: {
        description: 'Fetch a country flag',
        parameters: [{ name: '$country', type: 'string', required: true }],
      },
    },
    simpleFragment: 'The flag of Brazil is: ',
    adder: { name: '+', values: '$values' },
    shorthandFragment: {
      $stringSubstitution: ['My name is %1', '$name'],
      metadata: {
        description: 'Substitute a name into the sentence',
        parameters: [{ name: '$name', type: 'string', required: true }],
      },
    },
  },
})

// Fetch meta-data from the FigTree object
test('Metadata -- get operator info', () => {
  expect(fig.getOperators()).toStrictEqual([
    {
      name: 'AND',
      description: 'Logical AND',
      aliases: ['and', '&', '&&'],
      parameters: [
        {
          name: 'values',
          description: 'Returns true if all values are true',
          aliases: [],
          required: true,
          type: 'array',
          default: [true, true],
        },
      ],
    },
    {
      name: 'OR',
      description: 'Logical OR',
      aliases: ['or', '|', '||'],
      parameters: [
        {
          name: 'values',
          description: 'Returns true if any values are true',
          aliases: [],
          required: true,
          type: 'array',
          default: [true, false],
        },
      ],
    },
    {
      name: 'EQUAL',
      description: 'Test multiple values are equal',
      aliases: ['=', 'eq', 'equal', 'equals'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values to check for equality',
          aliases: [],
          required: true,
          type: 'array',
          default: ['These are equal', 'These are equal'],
        },
        {
          name: 'caseInsensitive',
          description: 'If the values are strings, ignore the case (default: false)',
          aliases: [],
          required: false,
          type: 'boolean',
          default: false,
        },
        {
          name: 'nullEqualsUndefined',
          description:
            'Whether a null value should be considered equal to an undefined value (default: false)',
          aliases: [],
          required: false,
          type: 'boolean',
          default: false,
        },
      ],
    },
    {
      name: 'NOT_EQUAL',
      description: 'Test if any values are different',
      aliases: ['!=', '!', 'ne', 'notEqual'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values to check for inequality',
          aliases: [],
          required: true,
          type: 'array',
          default: ['These items', "don't match"],
        },
        {
          name: 'caseInsensitive',
          description: 'If the values are strings, ignore the case (default: false)',
          aliases: [],
          required: false,
          type: 'boolean',
          default: false,
        },
        {
          name: 'nullEqualsUndefined',
          description:
            'Whether a null value should be considered equal to an undefined value (default: false)',
          aliases: [],
          required: false,
          type: 'boolean',
          default: false,
        },
      ],
    },
    {
      name: 'PLUS',
      description: 'Add, concatenate or merge multiple values',
      aliases: ['+', 'plus', 'add', 'concat', 'join', 'merge'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values to check to add together',
          aliases: [],
          required: true,
          type: 'array',
          default: [1, 2, 3],
        },
        {
          name: 'type',
          description: 'Data type to coerce input values to before addition',
          aliases: [],
          required: false,
          type: {
            literal: ['string', 'array', 'number', 'boolean', 'bool'],
          },
          default: 'string',
        },
      ],
    },
    {
      name: 'SUBTRACT',
      description: 'Subtract one numerical value from another',
      aliases: ['-', 'subtract', 'minus', 'takeaway'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values - 2nd element will be subtracted from the first',
          aliases: [],
          required: false,
          type: 'array',
          default: [10, 5],
        },
        {
          name: 'from',
          description: 'Numerical value that will be subtracted from',
          aliases: ['subtractFrom'],
          required: false,
          type: 'number',
          default: 100,
        },
        {
          name: 'subtract',
          description: 'Numerical value to subtract',
          aliases: [],
          required: false,
          type: 'number',
          default: 50,
        },
      ],
    },
    {
      name: 'MULTIPLY',
      description: 'Multiply several numerical values together',
      aliases: ['*', 'x', 'multiply', 'times'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values whose product will be calculated',
          aliases: [],
          required: true,
          type: 'array',
          default: [5, 5],
        },
      ],
    },
    {
      name: 'DIVIDE',
      description: 'Divide one numerical value by another',
      aliases: ['/', 'divide', '÷'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values - 1st element will be divided by the first',
          aliases: [],
          required: false,
          type: 'array',
          default: [100, 10],
        },
        {
          name: 'dividend',
          description: 'The number that will be divided',
          aliases: ['divide'],
          required: false,
          type: 'number',
          default: 99,
        },
        {
          name: 'divisor',
          description: 'The number that dividend will be divided by',
          aliases: ['by', 'divideBy'],
          required: false,
          type: 'number',
          default: 3,
        },
        {
          name: 'output',
          description: 'Whether to output a quotient, remainder or decimal',
          aliases: [],
          required: false,
          type: {
            literal: ['quotient', 'remainder'],
          },
          default: 'quotient',
        },
      ],
    },
    {
      name: 'GREATER_THAN',
      description: 'Test if a value is greater than (or equal to) another value',
      aliases: ['>', 'greaterThan', 'higher', 'larger'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values - 1st element will be compared to the second',
          aliases: [],
          required: true,
          type: 'array',
          default: [10, 9],
        },
        {
          name: 'strict',
          description:
            'Whether value must be strictly greater than (i.e. not equal) (default: false)',
          aliases: [],
          required: false,
          type: 'boolean',
          default: false,
        },
      ],
    },
    {
      name: 'LESS_THAN',
      description: 'Test if a value is smaller than (or equal to) another value',
      aliases: ['<', 'lessThan', 'lower', 'smaller'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values - 1st element will be compared to the second',
          aliases: [],
          required: true,
          type: 'array',
          default: [9, 10],
        },
        {
          name: 'strict',
          description:
            'Whether value must be strictly smaller than (i.e. not equal) (default: false)',
          aliases: [],
          required: false,
          type: 'boolean',
          default: false,
        },
      ],
    },
    {
      name: 'CONDITIONAL',
      description: 'Return a value based on a condition',
      aliases: ['?', 'conditional', 'ifThen'],
      parameters: [
        {
          name: 'condition',
          description: 'The expression to check for truthiness',
          aliases: [],
          required: true,
          type: 'any',
          default: true,
        },
        {
          name: 'valueIfTrue',
          description: 'Value to return if condition is true',
          aliases: ['ifTrue'],
          required: true,
          type: 'any',
          default: 'The condition is true',
        },
        {
          name: 'valueIfFalse',
          description: 'Value to return if condition is false',
          aliases: ['ifFalse', 'ifNot'],
          required: true,
          type: 'any',
          default: 'The condition is false',
        },
      ],
    },
    {
      name: 'REGEX',
      description: 'Compare a string against a regex pattern',
      aliases: ['regex', 'patternMatch', 'regexp', 'matchPattern'],
      parameters: [
        {
          name: 'testString',
          description: 'The string to test',
          aliases: ['string', 'value'],
          required: true,
          type: 'string',
          default: 'test-this',
        },
        {
          name: 'pattern',
          description: 'The regular expression pattern',
          aliases: ['regex', 'regexp', 'regExp', 're'],
          required: true,
          type: 'string',
          default: '^[a-z]{4}-[a-z]{4}$',
        },
      ],
    },
    {
      name: 'OBJECT_PROPERTIES',
      description: 'Extract values from data objects',
      aliases: [
        'dataProperties',
        'data',
        'getData',
        'objectProperties',
        'objProps',
        'getProperty',
        'getObjProp',
      ],
      parameters: [
        {
          name: 'property',
          description: 'The path to the required property (e.g. "user.firstName")',
          aliases: ['path', 'propertyName'],
          required: true,
          type: 'string',
          default: 'path.to[0].my.data',
        },
        {
          name: 'additionalData',
          description: 'Additional data objects to be considered',
          aliases: ['additional', 'objects', 'data', 'additionalObjects'],
          required: false,
          type: 'object',
          default: {},
        },
      ],
    },
    {
      name: 'STRING_SUBSTITUTION',
      description: 'Replace values in a string using simple parameter substitution',
      aliases: ['stringSubstitution', 'substitute', 'stringSub', 'replace'],
      parameters: [
        {
          name: 'string',
          description: 'A parameterised (%1, %2) string where the parameters are to be replaced',
          aliases: [],
          required: true,
          type: 'string',
          default: 'Hello, %1',
        },
        {
          name: 'substitutions',
          description: 'An array of substitution values for the parameterised string',
          aliases: ['replacements', 'values'],
          required: false,
          type: ['array', 'object'],
          default: {},
        },
        {
          name: 'trimWhiteSpace',
          description:
            'Whether or not to trim white space from either end of the substituted strings (default: true)',
          aliases: ['trim', 'trimWhitespace'],
          required: false,
          type: 'boolean',
          default: true,
        },
        {
          name: 'substitutionCharacter',
          description:
            'Which character to search for in original string for replacement -- can be "%" or "$" (default: "%")',
          aliases: ['subCharacter', 'subChar'],
          required: false,
          type: 'string',
          default: '$',
        },
        {
          name: 'numberMapping',
          description: 'Rules for mapping number values to text strings, such as pluralisation.',
          aliases: ['numMap', 'numberMap', 'pluralisation', 'pluralization', 'plurals'],
          required: false,
          type: 'object',
          default: {},
        },
      ],
    },
    {
      name: 'SPLIT',
      description: 'Split a string into an array',
      aliases: ['split', 'arraySplit'],
      parameters: [
        {
          name: 'value',
          description: 'The string to be split',
          aliases: ['string'],
          required: true,
          type: 'string',
          default: 'Alpha, Bravo, Charlie',
        },
        {
          name: 'delimiter',
          description: 'The value to split the string on (default is white space)',
          aliases: ['separator'],
          required: false,
          type: 'string',
          default: ',',
        },
        {
          name: 'trimWhiteSpace',
          description:
            'Whether to trim white space from around the resulting elements (default: true)',
          aliases: ['trim', 'trimWhitespace'],
          required: false,
          type: 'boolean',
          default: true,
        },
        {
          name: 'excludeTrailing',
          description:
            'If the input string ends in a delimiter, there will be an additional blank element if this value is false (default: true)',
          aliases: ['removeTrailing', 'excludeTrailingDelimiter'],
          required: false,
          type: 'boolean',
          default: true,
        },
      ],
    },
    {
      name: 'COUNT',
      description: 'Count elements in an array',
      aliases: ['count', 'length'],
      parameters: [
        {
          name: 'values',
          description: 'An array to count',
          aliases: [],
          required: true,
          type: 'array',
          default: [1, 2, 3, 4, 5],
        },
      ],
    },
    {
      name: 'GET',
      description: 'HTTP GET Request',
      aliases: ['get', 'api'],
      parameters: [
        {
          name: 'url',
          description: 'Endpoint URL',
          aliases: ['endpoint'],
          required: true,
          type: 'string',
          default: 'https://restcountries.com/v3.1/name/zealand',
        },
        {
          name: 'returnProperty',
          description: 'Property from request result',
          aliases: ['outputProperty'],
          required: false,
          type: 'string',
          default: 'result.path',
        },
        {
          name: 'headers',
          description: 'HTTP Headers',
          aliases: [],
          required: false,
          type: 'object',
          default: {},
        },
        {
          name: 'parameters',
          description: 'Query parameters (key-value)',
          aliases: ['queryParams', 'queryParameters', 'urlQueries'],
          required: false,
          type: 'object',
          default: {},
        },
        {
          name: 'useCache',
          description: 'Whether or not the FigTree cache is used',
          aliases: [],
          required: false,
          type: 'boolean',
          default: true,
        },
      ],
    },
    {
      name: 'POST',
      description: 'HTTP POST Request',
      aliases: ['post'],
      parameters: [
        {
          name: 'url',
          description: 'Endpoint URL',
          aliases: ['endpoint'],
          required: true,
          type: 'string',
          default: 'https://jsonplaceholder.typicode.com/posts',
        },
        {
          name: 'returnProperty',
          description: 'Property path from request result',
          aliases: ['outputProperty'],
          required: false,
          type: 'string',
          default: 'result.path',
        },
        {
          name: 'headers',
          description: 'HTTP Headers',
          aliases: [],
          required: false,
          type: 'object',
          default: {},
        },
        {
          name: 'parameters',
          description: 'JSON Body parameters (key-value)',
          aliases: ['bodyJson', 'data'],
          required: false,
          type: 'object',
          default: {},
        },
        {
          name: 'useCache',
          description: 'Whether or not the FigTree cache is used',
          aliases: [],
          required: false,
          type: 'boolean',
          default: true,
        },
      ],
    },
    {
      name: 'SQL',
      description: 'Query an SQL database',
      aliases: ['sql', 'pgSql', 'postgres', 'pg', 'sqLite', 'sqlite', 'mySql'],
      parameters: [
        {
          name: 'query',
          description: 'SQL query string, with parameterised replacements (e.g. $1, $2, etc)',
          aliases: ['text'],
          required: true,
          type: 'string',
        },
        {
          name: 'values',
          description:
            'An array/object of values to replace the SQL string parameters, as per SQL connection specifications ',
          aliases: ['replacements'],
          required: false,
          type: ['array', 'object'],
        },
        {
          name: 'single',
          description: 'Specify if returning a single record',
          aliases: ['singleRecord'],
          required: false,
          type: 'boolean',
        },
        {
          name: 'flatten',
          description: 'Specify whether to flatten resulting record objects to arrays of values',
          aliases: ['flat', 'array'],
          required: false,
          type: 'boolean',
        },
        {
          name: 'useCache',
          description: 'Whether or not the FigTree cache is used',
          aliases: [],
          required: false,
          type: 'boolean',
        },
      ],
    },
    {
      name: 'GRAPHQL',
      description: 'GraphQL request',
      aliases: ['graphQl', 'graphql', 'gql'],
      parameters: [
        {
          name: 'query',
          description: 'GraphQL query string',
          aliases: [],
          required: true,
          type: 'string',
          default:
            'query getCountries {\n      countries(filter: {continent: {eq: "OC"}}) {\n        name\n      }\n    }',
        },
        {
          name: 'url',
          description: 'Endpoint for the GraphQL request (if not already provided in options)',
          aliases: ['endpoint'],
          required: false,
          type: ['string', 'null'],
          default: 'https://countries.trevorblades.com/',
        },
        {
          name: 'headers',
          description: 'HTTP Headers (if not already provided in options)',
          aliases: [],
          required: false,
          type: 'object',
          default: {},
        },
        {
          name: 'variables',
          description: 'Values for the variables used in query (key-value pairs)',
          aliases: [],
          required: false,
          type: 'object',
          default: {},
        },
        {
          name: 'returnNode',
          description: 'Property path to extract from the query response',
          aliases: ['outputNode', 'returnProperty'],
          required: false,
          type: 'string',
          default: 'data.countries[1].name',
        },
        {
          name: 'useCache',
          description: 'Whether or not the FigTree cache is used',
          aliases: [],
          required: false,
          type: 'boolean',
          default: true,
        },
      ],
    },
    {
      name: 'BUILD_OBJECT',
      description: 'Construct an object using objects defining keys and values',
      aliases: ['buildObject', 'build', 'object'],
      parameters: [
        {
          name: 'properties',
          description: 'An array of objects, each with a "key" property and a "value" property',
          aliases: ['values', 'keyValPairs', 'keyValuePairs'],
          required: true,
          type: 'array',
          default: ['firstKey', 'firstValue', 'secondKey', 'secondValue'],
        },
      ],
    },
    {
      name: 'MATCH',
      description: 'Return different values depending on a matching expression',
      aliases: ['match', 'switch'],
      parameters: [
        {
          name: 'matchExpression',
          description: 'Expression to match against',
          aliases: ['match'],
          required: true,
          type: ['string', 'number', 'boolean'],
          default: 'matchMe',
        },
        {
          name: 'branches',
          description:
            'Object whose keys are compared against the match expression. The value of the matching key is returned',
          aliases: ['arms', 'cases'],
          required: false,
          type: ['object', 'array'],
          default: {
            matchMe: 'YES',
            nonMatch: 'NO',
          },
        },
        {
          name: '[...branches]',
          description: 'Branch properties can optionally be placed at the operator root',
          aliases: [],
          required: false,
          type: ['object', 'array'],
        },
      ],
    },
    {
      name: 'CUSTOM_FUNCTIONS',
      description: 'Call a custom function (defined in options)',
      aliases: [
        'customFunctions',
        'customFunction',
        'objectFunctions',
        'function',
        'functions',
        'runFunction',
      ],
      parameters: [
        {
          name: 'functionName',
          description: 'Path (in options.functions) to the required function',
          aliases: ['functionPath', 'funcName', 'function', 'path', 'name'],
          required: true,
          type: 'string',
          default: null,
        },
        {
          name: 'args',
          description: 'Arguments for the function',
          aliases: ['arguments', 'variables'],
          required: false,
          type: ['array', 'any'],
          default: [],
        },
        {
          name: 'input',
          description: 'Argument for the function if a single input parameter',
          aliases: ['arg'],
          required: false,
          type: 'any',
          default: 'input',
        },
        {
          name: 'useCache',
          description: 'Whether or not the FigTree cache is used',
          aliases: [],
          required: false,
          type: 'boolean',
          default: false,
        },
      ],
    },
    {
      name: 'PASSTHRU',
      description: 'Pass through a value unchanged (or change its type)',
      aliases: ['_', 'passThru', 'passthru', 'pass', 'ignore', 'coerce', 'convert'],
      parameters: [
        {
          name: 'value',
          description: 'Value to pass through',
          aliases: ['_', 'data'],
          required: true,
          type: 'any',
          default: null,
        },
      ],
    },
  ])
})

test('Metadata -- get fragment info', () => {
  expect(fig.getFragments()).toStrictEqual([
    {
      name: 'getFlag',
      description: 'Fetch a country flag',
      parameters: [{ name: '$country', type: 'string', required: true }],
    },
    { name: 'simpleFragment' },
    { name: 'adder' },
    {
      name: 'shorthandFragment',
      description: 'Substitute a name into the sentence',
      parameters: [{ name: '$name', type: 'string', required: true }],
    },
  ])
})

test('Metadata -- get customFunction info', () => {
  console.log(fig.getCustomFunctions())
  expect(fig.getCustomFunctions()).toStrictEqual([
    { name: 'getPrincess', numRequiredArgs: 1 },
    { name: 'fDouble', numRequiredArgs: 0 },
    {
      name: 'fDate',
      numRequiredArgs: 1,
      description: 'Turn a date string into a JS Date object',
      argsDefault: ['December 23, 1995 03:24:00'],
    },
    {
      name: 'addTwo',
      numRequiredArgs: 2,
      inputDefault: { n1: 10, n2: 10 },
    },
    {
      name: 'fNoArgs',
      numRequiredArgs: 0,
      description: 'Returns 10 🤷‍♂️',
    },
  ])
})
