/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Written by codegen/extractV2Table.ts (`pnpm extractV2Table`) from the
 * published v2 package, fig-tree-evaluator 2.23.2 (the devDependency
 * `fig-tree-evaluator-v2`): each operator's name, aliases and parameters,
 * as its `getOperators()` reports them. test/migrate-table.test.ts holds
 * this module to a fresh extraction ("The v2 reference table" in
 * docs-dev/v3-specs/v3-converter.md).
 */

/** The v2 release this table was extracted from. */
export const V2_VERSION = '2.23.2'

/** The 24 v2 operators, by their canonical names. */
export type V2Operator =
  | 'AND'
  | 'OR'
  | 'EQUAL'
  | 'NOT_EQUAL'
  | 'PLUS'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'CONDITIONAL'
  | 'REGEX'
  | 'OBJECT_PROPERTIES'
  | 'STRING_SUBSTITUTION'
  | 'SPLIT'
  | 'COUNT'
  | 'GET'
  | 'POST'
  | 'SQL'
  | 'GRAPHQL'
  | 'BUILD_OBJECT'
  | 'MATCH'
  | 'CUSTOM_FUNCTIONS'
  | 'PASSTHRU'

/** A v2 parameter by its canonical name, with its property aliases. */
export interface V2Parameter {
  name: string
  aliases: readonly string[]
}

/**
 * v2's alias table: every name an operator node could give, mapped to its
 * operator. v2 standardized a name before looking it up (./names.ts), so
 * some keys can never match (`GET` standardizes to `get`), and they are
 * kept, since the table is v2's own.
 */
export const V2_NAMES: Record<string, V2Operator> = {
  and: 'AND',
  '&': 'AND',
  '&&': 'AND',
  or: 'OR',
  '|': 'OR',
  '||': 'OR',
  '=': 'EQUAL',
  eq: 'EQUAL',
  equal: 'EQUAL',
  equals: 'EQUAL',
  '!=': 'NOT_EQUAL',
  notEqual: 'NOT_EQUAL',
  '!': 'NOT_EQUAL',
  ne: 'NOT_EQUAL',
  '+': 'PLUS',
  plus: 'PLUS',
  add: 'PLUS',
  concat: 'PLUS',
  join: 'PLUS',
  merge: 'PLUS',
  '-': 'SUBTRACT',
  subtract: 'SUBTRACT',
  minus: 'SUBTRACT',
  takeaway: 'SUBTRACT',
  '*': 'MULTIPLY',
  x: 'MULTIPLY',
  multiply: 'MULTIPLY',
  times: 'MULTIPLY',
  '/': 'DIVIDE',
  divide: 'DIVIDE',
  '÷': 'DIVIDE',
  '>': 'GREATER_THAN',
  greaterThan: 'GREATER_THAN',
  higher: 'GREATER_THAN',
  larger: 'GREATER_THAN',
  '<': 'LESS_THAN',
  lessThan: 'LESS_THAN',
  lower: 'LESS_THAN',
  smaller: 'LESS_THAN',
  '?': 'CONDITIONAL',
  conditional: 'CONDITIONAL',
  ifThen: 'CONDITIONAL',
  regex: 'REGEX',
  patternMatch: 'REGEX',
  regexp: 'REGEX',
  matchPattern: 'REGEX',
  getData: 'OBJECT_PROPERTIES',
  dataProperties: 'OBJECT_PROPERTIES',
  data: 'OBJECT_PROPERTIES',
  objectProperties: 'OBJECT_PROPERTIES',
  objProps: 'OBJECT_PROPERTIES',
  getProperty: 'OBJECT_PROPERTIES',
  getObjProp: 'OBJECT_PROPERTIES',
  stringSubstitution: 'STRING_SUBSTITUTION',
  substitute: 'STRING_SUBSTITUTION',
  stringSub: 'STRING_SUBSTITUTION',
  replace: 'STRING_SUBSTITUTION',
  split: 'SPLIT',
  arraySplit: 'SPLIT',
  count: 'COUNT',
  length: 'COUNT',
  GET: 'GET',
  get: 'GET',
  api: 'GET',
  POST: 'POST',
  post: 'POST',
  sql: 'SQL',
  pgSql: 'SQL',
  postgres: 'SQL',
  pg: 'SQL',
  sqLite: 'SQL',
  sqlite: 'SQL',
  mySql: 'SQL',
  graphQL: 'GRAPHQL',
  graphQl: 'GRAPHQL',
  graphql: 'GRAPHQL',
  gql: 'GRAPHQL',
  buildObject: 'BUILD_OBJECT',
  build: 'BUILD_OBJECT',
  object: 'BUILD_OBJECT',
  match: 'MATCH',
  switch: 'MATCH',
  customFunctions: 'CUSTOM_FUNCTIONS',
  customFunction: 'CUSTOM_FUNCTIONS',
  objectFunctions: 'CUSTOM_FUNCTIONS',
  function: 'CUSTOM_FUNCTIONS',
  functions: 'CUSTOM_FUNCTIONS',
  runFunction: 'CUSTOM_FUNCTIONS',
  pass: 'PASSTHRU',
  _: 'PASSTHRU',
  passThru: 'PASSTHRU',
  passthru: 'PASSTHRU',
  ignore: 'PASSTHRU',
  coerce: 'PASSTHRU',
  convert: 'PASSTHRU',
}

/** Each operator's parameters in declaration order, with their aliases. */
export const V2_PARAMETERS: Record<V2Operator, readonly V2Parameter[]> = {
  AND: [{ name: 'values', aliases: [] }],
  OR: [{ name: 'values', aliases: [] }],
  EQUAL: [
    { name: 'values', aliases: [] },
    { name: 'caseInsensitive', aliases: [] },
    { name: 'nullEqualsUndefined', aliases: [] },
  ],
  NOT_EQUAL: [
    { name: 'values', aliases: [] },
    { name: 'caseInsensitive', aliases: [] },
    { name: 'nullEqualsUndefined', aliases: [] },
  ],
  PLUS: [
    { name: 'values', aliases: [] },
    { name: 'type', aliases: [] },
  ],
  SUBTRACT: [
    { name: 'values', aliases: [] },
    { name: 'from', aliases: ['subtractFrom'] },
    { name: 'subtract', aliases: [] },
  ],
  MULTIPLY: [{ name: 'values', aliases: [] }],
  DIVIDE: [
    { name: 'values', aliases: [] },
    { name: 'dividend', aliases: ['divide'] },
    { name: 'divisor', aliases: ['by', 'divideBy'] },
    { name: 'output', aliases: [] },
  ],
  GREATER_THAN: [
    { name: 'values', aliases: [] },
    { name: 'strict', aliases: [] },
  ],
  LESS_THAN: [
    { name: 'values', aliases: [] },
    { name: 'strict', aliases: [] },
  ],
  CONDITIONAL: [
    { name: 'condition', aliases: [] },
    { name: 'valueIfTrue', aliases: ['ifTrue'] },
    { name: 'valueIfFalse', aliases: ['ifFalse', 'ifNot'] },
  ],
  REGEX: [
    { name: 'testString', aliases: ['string', 'value'] },
    { name: 'pattern', aliases: ['regex', 'regexp', 'regExp', 're'] },
  ],
  OBJECT_PROPERTIES: [
    { name: 'property', aliases: ['path', 'propertyName'] },
    { name: 'additionalData', aliases: ['additional', 'objects', 'data', 'additionalObjects'] },
  ],
  STRING_SUBSTITUTION: [
    { name: 'string', aliases: [] },
    { name: 'substitutions', aliases: ['replacements', 'values'] },
    { name: 'trimWhiteSpace', aliases: ['trim', 'trimWhitespace'] },
    { name: 'substitutionCharacter', aliases: ['subCharacter', 'subChar'] },
    {
      name: 'numberMapping',
      aliases: ['numMap', 'numberMap', 'pluralisation', 'pluralization', 'plurals'],
    },
  ],
  SPLIT: [
    { name: 'value', aliases: ['string'] },
    { name: 'delimiter', aliases: ['separator'] },
    { name: 'trimWhiteSpace', aliases: ['trim', 'trimWhitespace'] },
    { name: 'excludeTrailing', aliases: ['removeTrailing', 'excludeTrailingDelimiter'] },
  ],
  COUNT: [{ name: 'values', aliases: [] }],
  GET: [
    { name: 'url', aliases: ['endpoint'] },
    { name: 'returnProperty', aliases: ['outputProperty'] },
    { name: 'headers', aliases: [] },
    { name: 'parameters', aliases: ['queryParams', 'queryParameters', 'urlQueries'] },
    { name: 'useCache', aliases: [] },
  ],
  POST: [
    { name: 'url', aliases: ['endpoint'] },
    { name: 'returnProperty', aliases: ['outputProperty'] },
    { name: 'headers', aliases: [] },
    { name: 'parameters', aliases: ['bodyJson', 'data'] },
    { name: 'useCache', aliases: [] },
  ],
  SQL: [
    { name: 'query', aliases: ['text'] },
    { name: 'values', aliases: ['replacements'] },
    { name: 'single', aliases: ['singleRecord'] },
    { name: 'flatten', aliases: ['flat', 'array'] },
    { name: 'useCache', aliases: [] },
  ],
  GRAPHQL: [
    { name: 'query', aliases: [] },
    { name: 'url', aliases: ['endpoint'] },
    { name: 'headers', aliases: [] },
    { name: 'variables', aliases: [] },
    { name: 'returnNode', aliases: ['outputNode', 'returnProperty'] },
    { name: 'useCache', aliases: [] },
  ],
  BUILD_OBJECT: [{ name: 'properties', aliases: ['values', 'keyValPairs', 'keyValuePairs'] }],
  MATCH: [
    { name: 'matchExpression', aliases: ['matchValue'] },
    { name: 'branches', aliases: ['arms', 'cases'] },
  ],
  CUSTOM_FUNCTIONS: [
    { name: 'functionName', aliases: ['functionPath', 'funcName', 'function', 'path', 'name'] },
    { name: 'args', aliases: ['arguments', 'variables'] },
    { name: 'input', aliases: ['arg'] },
    { name: 'useCache', aliases: [] },
  ],
  PASSTHRU: [{ name: 'value', aliases: ['_', 'data'] }],
}
