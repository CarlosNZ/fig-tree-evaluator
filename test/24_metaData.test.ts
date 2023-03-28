import FigTreeEvaluator from '../src'

const fig = new FigTreeEvaluator({
  functions: {
    getPrincess: (name: string) => `Princess ${name}`,
    fDouble: (...args: any) => args.map((e: any) => e + e),
    fDate: (dateString: string) => new Date(dateString),
    addTwo: (n1: number, n2: number) => n1 + n2,
    fNoArgs: () => 5 * 5,
  },
  fragments: {
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
      metadata: {
        description: 'Fetch a country flag',
        parameters: { $country: { type: 'string', required: true } },
      },
    },
    simpleFragment: 'The flag of Brazil is: ',
    adder: { operator: '+', values: '$values' },
    shorthandFragment: {
      $stringSubstitution: ['My name is %1', '$name'],
      metadata: {
        description: 'Substitute a name into the sentence',
        parameters: { $name: { type: 'string', required: true } },
      },
    },
  },
})

// Fetch meta-data from the FigTree object
test('Metadata -- get operator info', () => {
  expect(fig.getOperators()).toStrictEqual([
    {
      operator: 'AND',
      description: 'Logical AND',
      aliases: ['and', '&', '&&'],
      parameters: [
        {
          name: 'values',
          description: 'Returns true if all values are true',
          aliases: [],
          required: true,
          type: 'array',
        },
      ],
    },
    {
      operator: 'OR',
      description: 'Logical OR',
      aliases: ['or', '|', '||'],
      parameters: [
        {
          name: 'values',
          description: 'Returns true if any values are true',
          aliases: [],
          required: true,
          type: 'array',
        },
      ],
    },
    {
      operator: 'EQUAL',
      description: 'Test multiple values are equal',
      aliases: ['=', 'eq', 'equal', 'equals'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values to check for equality',
          aliases: [],
          required: true,
          type: 'array',
        },
        {
          name: 'nullEqualsUndefined',
          description: 'Whether a null value should be considered equal to an undefined value',
          aliases: [],
          required: false,
          type: 'boolean',
        },
      ],
    },
    {
      operator: 'NOT_EQUAL',
      description: 'Test if any values are different',
      aliases: ['!=', '!', 'ne', 'notEqual'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values to check for inequality',
          aliases: [],
          required: true,
          type: 'array',
        },
        {
          name: 'nullEqualsUndefined',
          description: 'Whether a null value should be considered equal to an undefined value',
          aliases: [],
          required: false,
          type: 'boolean',
        },
      ],
    },
    {
      operator: 'PLUS',
      description: 'Add, concatenate or merge multiple values',
      aliases: ['+', 'plus', 'add', 'concat', 'join', 'merge'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values to check to add together',
          aliases: [],
          required: true,
          type: 'array',
        },
        {
          name: 'type',
          description: 'Data type to coerce input values to before addition',
          aliases: [],
          required: false,
          type: 'string',
        },
      ],
    },
    {
      operator: 'SUBTRACT',
      description: 'Subtract one numerical value from another',
      aliases: ['-', 'subtract', 'minus', 'takeaway'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values - 2nd element will be subtracted from the first',
          aliases: [],
          required: false,
          type: 'array',
        },
        {
          name: 'from',
          description: 'Numerical value that will be subtracted from',
          aliases: ['subtractFrom'],
          required: false,
          type: 'number',
        },
        {
          name: 'subtract',
          description: 'Numerical value to subtract',
          aliases: [],
          required: false,
          type: 'number',
        },
      ],
    },
    {
      operator: 'MULTIPLY',
      description: 'Multiply several numerical values together',
      aliases: ['*', 'x', 'multiply', 'times'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values whose product will be calculated',
          aliases: [],
          required: true,
          type: 'array',
        },
      ],
    },
    {
      operator: 'DIVIDE',
      description: 'Divide one numerical value by another',
      aliases: ['/', 'divide', '÷'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values - 1st element will be divided by the first',
          aliases: [],
          required: false,
          type: 'array',
        },
        {
          name: 'dividend',
          description: 'The number that will be divided',
          aliases: ['divide'],
          required: false,
          type: 'number',
        },
        {
          name: 'divisor',
          description: 'The number that dividend will be divided by',
          aliases: ['by', 'divideBy'],
          required: false,
          type: 'number',
        },
        {
          name: 'output',
          description: 'Whether to output a quotient, remainder or decimal',
          aliases: [],
          required: false,
          type: 'string',
        },
      ],
    },
    {
      operator: 'GREATER_THAN',
      description: 'Test if a value is greater than (or equal to) another value',
      aliases: ['>', 'greaterThan', 'higher', 'larger'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values - 1st element will be compared to the second',
          aliases: [],
          required: true,
          type: 'array',
        },
        {
          name: 'strict',
          description:
            'Whether value must be strictly greater than (i.e. not equal) (default: false)',
          aliases: [],
          required: false,
          type: 'boolean',
        },
      ],
    },
    {
      operator: 'LESS_THAN',
      description: 'Test if a value is smaller than (or equal to) another value',
      aliases: ['<', 'lessThan', 'lower', 'smaller'],
      parameters: [
        {
          name: 'values',
          description: 'Array of values - 1st element will be compared to the second',
          aliases: [],
          required: true,
          type: 'array',
        },
        {
          name: 'strict',
          description:
            'Whether value must be strictly smaller than (i.e. not equal) (default: false)',
          aliases: [],
          required: false,
          type: 'boolean',
        },
      ],
    },
    {
      operator: 'CONDITIONAL',
      description: 'Return a value based on a condition',
      aliases: ['?', 'conditional', 'ifThen'],
      parameters: [
        {
          name: 'condition',
          description: 'The expression to check for truthiness',
          aliases: [],
          required: true,
          type: 'any',
        },
        {
          name: 'valueIfTrue',
          description: 'Value to return if condition is true',
          aliases: ['ifTrue'],
          required: true,
          type: 'any',
        },
        {
          name: 'valueIfFalse',
          description: 'Value to return if condition is false',
          aliases: ['ifFalse', 'ifNot'],
          required: true,
          type: 'any',
        },
      ],
    },
    {
      operator: 'REGEX',
      description: 'Compare a string against a regex pattern',
      aliases: ['regex', 'patternMatch', 'regexp', 'matchPattern'],
      parameters: [
        {
          name: 'testString',
          description: 'The string to test',
          aliases: ['string', 'value'],
          required: true,
          type: 'string',
        },
        {
          name: 'pattern',
          description: 'The regular expression pattern',
          aliases: ['regex', 'regexp', 'regExp', 're'],
          required: true,
          type: 'string',
        },
      ],
    },
    {
      operator: 'OBJECT_PROPERTIES',
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
        },
        {
          name: 'additionalData',
          description: 'Additional data objects to be considered',
          aliases: ['additional', 'objects', 'data', 'additionalObjects'],
          required: false,
          type: 'object',
        },
      ],
    },
    {
      operator: 'STRING_SUBSTITUTION',
      description: 'Replace values in a string using simple parameter substitution',
      aliases: ['stringSubstitution', 'substitute', 'stringSub', 'replace'],
      parameters: [
        {
          name: 'string',
          description: 'A parameterised (%1, %2) string where the parameters are to be replaced',
          aliases: [],
          required: true,
          type: 'string',
        },
        {
          name: 'substitutions',
          description: 'An array of substitution values for the parameterised string',
          aliases: ['replacements'],
          required: true,
          type: 'array',
        },
      ],
    },
    {
      operator: 'COUNT',
      description: 'Count elements in an array',
      aliases: ['count', 'length'],
      parameters: [
        {
          name: 'values',
          description: 'An array to count',
          aliases: [],
          required: true,
          type: 'array',
        },
      ],
    },
    {
      operator: 'SPLIT',
      description: 'Split a string into an array',
      aliases: ['split', 'arraySplit'],
      parameters: [
        {
          name: 'value',
          description: 'The string to be split',
          aliases: ['string'],
          required: true,
          type: 'string',
        },
        {
          name: 'delimiter',
          description: 'The value to split the string on (default is white space)',
          aliases: ['separator'],
          required: false,
          type: 'string',
        },
        {
          name: 'trimWhiteSpace',
          description:
            'Whether to trim white space from around the resulting elements (default: true)',
          aliases: ['trim', 'trimWhitespace'],
          required: false,
          type: 'boolean',
        },
        {
          name: 'excludeTrailing',
          description:
            'If the input string ends in a delimiter, there will be an additional blank element if this value is false (default: true)',
          aliases: ['removeTrailing', 'excludeTrailingDelimiter'],
          required: false,
          type: 'boolean',
        },
      ],
    },
    {
      operator: 'PG_SQL',
      description: 'Query a Postgres database using node-postgres',
      aliases: ['pgSql', 'sql', 'postgres', 'pg', 'pgDb'],
      parameters: [
        {
          name: 'query',
          description: 'A SQL query string, with parameterised replacements (i.e. $1, $2, etc)',
          aliases: [],
          required: true,
          type: 'string',
        },
        {
          name: 'values',
          description: 'An array of values to replace in the SQL string parameters',
          aliases: ['replacements'],
          required: false,
          type: 'array',
        },
        {
          name: 'type',
          description: 'Determines the shape of the resulting data (see documentation)',
          aliases: ['queryType'],
          required: false,
          type: 'string',
        },
      ],
    },
    {
      operator: 'GRAPHQL',
      description: 'GraphQL request',
      aliases: ['graphQl', 'graphql', 'gql'],
      parameters: [
        {
          name: 'query',
          description: 'GraphQL query string',
          aliases: [],
          required: true,
          type: 'string',
        },
        {
          name: 'url',
          description: 'Endpoint for the GraphQL request (if not already provided in options)',
          aliases: ['endpoint'],
          required: false,
          type: ['string', 'null'],
        },
        {
          name: 'headers',
          description: 'HTTP Headers (if not already provided in options)',
          aliases: [],
          required: false,
          type: 'object',
        },
        {
          name: 'variables',
          description: 'Values for the variables used in query (key-value pairs)',
          aliases: [],
          required: false,
          type: 'object',
        },
        {
          name: 'returnNode',
          description: 'Property path to extract from the query response',
          aliases: ['outputNode', 'returnProperty'],
          required: false,
          type: 'string',
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
      operator: 'GET',
      description: 'HTTP GET Request',
      aliases: ['get', 'api'],
      parameters: [
        {
          name: 'url',
          description: 'Endpoint URL',
          aliases: ['endpoint'],
          required: true,
          type: 'string',
        },
        {
          name: 'returnProperty',
          description: 'Property from request result',
          aliases: ['outputProperty'],
          required: false,
          type: 'string',
        },
        {
          name: 'headers',
          description: 'HTTP Headers',
          aliases: [],
          required: false,
          type: 'object',
        },
        {
          name: 'parameters',
          description: 'Query parameters (key-value)',
          aliases: [],
          required: false,
          type: 'object',
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
      operator: 'POST',
      description: 'HTTP POST Request',
      aliases: ['post'],
      parameters: [
        {
          name: 'url',
          description: 'Endpoint URL',
          aliases: ['endpoint'],
          required: true,
          type: 'string',
        },
        {
          name: 'returnProperty',
          description: 'Property path from request result',
          aliases: ['outputProperty'],
          required: false,
          type: 'string',
        },
        {
          name: 'headers',
          description: 'HTTP Headers',
          aliases: [],
          required: false,
          type: 'object',
        },
        {
          name: 'data',
          description: 'JSON Body parameters (key-value)',
          aliases: [],
          required: false,
          type: 'object',
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
      operator: 'BUILD_OBJECT',
      description: 'Construct an object using objects defining keys and values',
      aliases: ['buildObject', 'build', 'object'],
      parameters: [
        {
          name: 'properties',
          description: 'An array of objects, each with a "key" property and a "value" property',
          aliases: ['values', 'keyValPairs', 'keyValuePairs'],
          required: true,
          type: 'array',
        },
      ],
    },
    {
      operator: 'MATCH',
      description: 'Return different values depending on a matching expression',
      aliases: ['match', 'switch'],
      parameters: [
        {
          name: 'matchExpression',
          description: 'Expression to match against',
          aliases: ['match'],
          required: true,
          type: ['string', 'number', 'boolean'],
        },
        {
          name: 'branches',
          description:
            'Object whose keys are compared against the match expression. The value of the matching key is returned',
          aliases: ['arms', 'cases'],
          required: false,
          type: ['object', 'array'],
        },
      ],
    },
    {
      operator: 'CUSTOM_FUNCTIONS',
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
          name: 'functionPath',
          description: 'Path (in options.functions) to the required function',
          aliases: ['functionsPath', 'functionName', 'funcName', 'path', 'name'],
          required: true,
          type: 'string',
        },
        {
          name: 'args',
          description: 'Arguments for the function',
          aliases: ['arguments', 'variables'],
          required: false,
          type: ['array'],
        },
      ],
    },
    {
      operator: 'PASSTHRU',
      description: 'Pass through a value unchanged (or change its type)',
      aliases: ['_', 'passThru', 'passthru', 'pass', 'ignore', 'coerce', 'convert'],
      parameters: [
        {
          name: 'value',
          description: 'Value to pass through',
          aliases: ['_', 'data'],
          required: true,
          type: 'any',
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
      parameters: { $country: { type: 'string', required: true } },
    },
    { name: 'simpleFragment' },
    { name: 'adder' },
    {
      name: 'shorthandFragment',
      description: 'Substitute a name into the sentence',
      parameters: { $name: { type: 'string', required: true } },
    },
  ])
})

test('Metadata -- get customFunction info', () => {
  expect(fig.getCustomFunctions()).toStrictEqual([
    { name: 'getPrincess', numRequiredArgs: 1 },
    { name: 'fDouble', numRequiredArgs: 0 },
    { name: 'fDate', numRequiredArgs: 1 },
    { name: 'addTwo', numRequiredArgs: 2 },
    { name: 'fNoArgs', numRequiredArgs: 0 },
  ])
})
