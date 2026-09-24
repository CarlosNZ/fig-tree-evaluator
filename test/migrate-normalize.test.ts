/**
 * Phase 15.1 — the v2 converter's stage 1, the normalizer ("Stage 1:
 * normalize" and "Source paths" in docs-dev/v3-specs/v3-converter.md).
 *
 * Every example is normalized from a deep-frozen input, and holds to three
 * things: the result is canonical v2, which an independent checker confirms;
 * the published v2 package (the devDependency `fig-tree-evaluator-v2`)
 * evaluates it as it evaluated the input; and normalizing it again changes
 * nothing. The one expected difference is the `$count` quirk the spec names.
 *
 * I/O runs against echo clients, which answer with the request v2 sent, so a
 * converted request is compared along with the result.
 */
import { FigTreeEvaluator, type EvaluatorNode, type FigTreeOptions } from 'fig-tree-evaluator-v2'
import type { V2Options } from '../src/migrationTypes'
import type { IssueCode, Path } from '../src/migrate/issues'
import { normalizeV2 } from '../src/migrate/normalize'
import { V2_PARAMETERS } from '../src/migrate/v2/operators.generated'
import { canonicalViolations } from './helpers/canonicalV2'
import { clone, deepFreeze } from './helpers/migration'

const data = {
  user: { name: 'Ann', friends: [{ name: 'Bo' }, { name: 'Cy' }] },
  list: [1, 2, 3],
  n: 7,
  t: 'string',
  which: 'adder',
}

const functions = {
  echo: (...args: unknown[]) => ({ echo: args }),
  // Shares a v2 operator's name: the function wins in `operator`, and the
  // operator in shorthand
  count: (...args: unknown[]) => ({ count: args }),
}

const fragments = {
  adder: { operator: '+', values: '$values' },
  pair: { operator: '+', values: ['$a', '$b'] },
  withDefault: { operator: '+', values: ['$n', 1], $n: 10 },
  shorthandBody: { $plus: ['$n', 1], $n: 1 },
  counter: { operator: '+', values: ['$count', 1] },
  plusBody: { operator: '+', values: [1, 2] },
  reader: { operator: '+', values: ['$n', 100] },
  constant: 42,
}

interface V2Request {
  url: string
  params?: unknown
  data?: unknown
  headers?: unknown
}

// GraphQL reads a response's `data`, so a POST answers with the request there
// too
const httpClient = {
  get: async ({ url, params, headers }: V2Request) => ({ method: 'get', url, params, headers }),
  post: async ({ url, params, data, headers }: V2Request) => ({
    method: 'post',
    url,
    params,
    headers,
    data: { url, headers, body: data },
  }),
  throwError: (error: unknown) => {
    throw error
  },
}

const sqlConnection = {
  query: async ({ query, values }: { query: string; values?: unknown }) => [
    { query, values: values ?? null },
  ],
}

const optionsFor = (options: V2Options = {}): V2Options => ({ fragments, functions, ...options })

/** What v2 makes of an expression: its value, or that it failed */
const v2 = async (expression: unknown, options: V2Options) => {
  const fig = new FigTreeEvaluator({
    data,
    httpClient,
    sqlConnection,
    baseEndpoint: 'https://base.test',
    graphQLConnection: { endpoint: 'https://graphql.test' },
    ...options,
  } as FigTreeOptions)
  try {
    return { value: await fig.evaluate(clone(expression) as EvaluatorNode) }
  } catch {
    return { error: true }
  }
}

const normalize = (input: unknown, options?: V2Options) =>
  normalizeV2(deepFreeze(clone(input)), optionsFor(options))

const hasPath = (value: unknown, path: Path): boolean =>
  path.every((segment) => {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, segment)) return false
    value = (value as Record<string | number, unknown>)[segment]
    return true
  })

interface Example {
  name: string
  input: unknown
  /** `evaluateFullObject` and `noShorthand`; the fixtures supply the rest */
  options?: V2Options
  /** The canonical tree, where the example pins it */
  expected?: unknown
  /** What stage 1 dropped: each issue's code and input path */
  issues?: { code: IssueCode; path: Path }[]
}

const node = { operator: '+', values: [1, 2] }

const EXAMPLES: Example[] = [
  // Shorthand
  {
    name: 'an operator shorthand with an array',
    input: { $plus: [1, 2] },
    expected: { operator: 'PLUS', values: [1, 2] },
  },
  {
    name: 'an unresolved `$` key beside shorthand is an alias definition',
    input: { $plus: ['$n', 2], $n: 5 },
    expected: { operator: 'PLUS', values: ['$n', 2], $n: 5 },
  },
  {
    name: "another key of the object overwrites the payload's",
    input: { $plus: { values: [1, 2] }, values: [3, 4] },
    expected: { operator: 'PLUS', values: [3, 4] },
    issues: [{ code: 'overridden-value', path: ['$plus', 'values'] }],
  },
  {
    name: "a later `$` key's result overwrites an earlier one's",
    input: { $plus: [1, 2], $multiply: [3, 4] },
    expected: { operator: 'MULTIPLY', values: [3, 4] },
    issues: [{ code: 'overridden-value', path: ['$plus'] }],
  },
  {
    name: 'a positional shorthand',
    input: { $conditional: [true, 'yes', 'no'] },
    expected: { operator: 'CONDITIONAL', condition: true, valueIfTrue: 'yes', valueIfFalse: 'no' },
  },
  {
    name: 'a single value is a single child',
    input: { $getData: 'user.name' },
    expected: { operator: 'OBJECT_PROPERTIES', property: 'user.name' },
  },
  {
    name: 'an object with no `$` keys is named parameters',
    input: { $getData: { property: 'user.name' } },
    expected: { operator: 'OBJECT_PROPERTIES', property: 'user.name' },
  },
  {
    name: 'an object with a `$` key is a single child',
    input: { $length: { $n: 1 } },
    expected: { operator: 'COUNT', values: [{ $n: 1 }] },
  },
  {
    name: "a payload's own `operator` replaces the resolved name",
    input: { $length: { operator: 'getData', property: 'list' } },
    expected: { operator: 'OBJECT_PROPERTIES', property: 'list' },
    issues: [{ code: 'overridden-value', path: ['$length'] }],
  },
  {
    name: "a payload's own `fragment` makes a fragment call",
    input: { $plus: { fragment: 'pair', parameters: { $a: 1, $b: 2 } } },
    expected: { fragment: 'pair', parameters: { $a: 1, $b: 2 } },
    issues: [{ code: 'overridden-value', path: ['$plus'] }],
  },
  {
    name: 'shorthand inside shorthand',
    input: { $plus: [{ $multiply: [2, 3] }, 1] },
    expected: { operator: 'PLUS', values: [{ operator: 'MULTIPLY', values: [2, 3] }, 1] },
  },
  {
    name: 'an unresolved `$` key on a plain object is data',
    input: { $nope: 1, a: 2 },
    expected: { $nope: 1, a: 2 },
  },
  {
    name: 'with `noShorthand`, shorthand is data',
    input: { $plus: [1, 2] },
    options: { noShorthand: true },
    expected: { $plus: [1, 2] },
  },
  {
    name: 'on a node, every `$` key is an alias, even one naming an operator',
    input: { operator: '+', $x: 5, values: ['$x', 1] },
    expected: { operator: 'PLUS', values: ['$x', 1], $x: 5 },
  },
  {
    name: 'shorthand in parameters',
    input: {
      operator: '?',
      condition: { $equal: [1, 1] },
      valueIfTrue: { $plus: [1, 2] },
      valueIfFalse: 0,
    },
    expected: {
      operator: 'CONDITIONAL',
      condition: { operator: 'EQUAL', values: [1, 1] },
      valueIfTrue: { operator: 'PLUS', values: [1, 2] },
      valueIfFalse: 0,
    },
  },

  // Names
  {
    name: 'a name in another case',
    input: { operator: 'Plus', values: [1, 2] },
    expected: { operator: 'PLUS', values: [1, 2] },
  },
  {
    name: 'a SCREAMING_CASE name',
    input: { operator: 'NOT_EQUAL', values: [1, 2] },
    expected: { operator: 'NOT_EQUAL', values: [1, 2] },
  },
  {
    name: 'a snake_case alias',
    input: { operator: 'get_data', property: 'n' },
    expected: { operator: 'OBJECT_PROPERTIES', property: 'n' },
  },
  {
    name: 'an alias',
    input: { operator: 'add', values: ['a', 'b'] },
    expected: { operator: 'PLUS', values: ['a', 'b'] },
  },
  {
    name: 'an unknown operator is left as written, contents and all',
    input: { operator: 'nope', values: [{ $plus: [1] }], ifTrue: 1 },
    expected: { operator: 'nope', values: [{ $plus: [1] }], ifTrue: 1 },
  },
  {
    name: 'a number as the operator is left as written',
    input: { operator: 5, values: [1] },
    expected: { operator: 5, values: [1] },
  },
  {
    name: 'a computed operator is left as written',
    input: { operator: { $getData: 't' }, values: [1, 2] },
    expected: { operator: { $getData: 't' }, values: [1, 2] },
  },

  // Property aliases
  {
    name: 'property aliases become names',
    input: { operator: '?', condition: false, ifTrue: 'a', ifNot: 'b' },
    expected: { operator: 'CONDITIONAL', condition: false, valueIfTrue: 'a', valueIfFalse: 'b' },
  },
  {
    name: 'property aliases on REGEX',
    input: { operator: 'regex', string: 'abc', re: 'b' },
    expected: { operator: 'REGEX', testString: 'abc', pattern: 'b' },
  },
  {
    name: 'a parameter by name then alias keeps the alias',
    input: { operator: '?', condition: true, valueIfTrue: 'a', ifTrue: 'b', valueIfFalse: 'c' },
    expected: { operator: 'CONDITIONAL', condition: true, valueIfTrue: 'b', valueIfFalse: 'c' },
    issues: [{ code: 'overridden-value', path: ['valueIfTrue'] }],
  },
  {
    name: 'a parameter by alias then name keeps the name',
    input: { operator: '?', condition: true, ifTrue: 'b', valueIfTrue: 'a', valueIfFalse: 'c' },
    expected: { operator: 'CONDITIONAL', condition: true, valueIfTrue: 'a', valueIfFalse: 'c' },
    issues: [{ code: 'overridden-value', path: ['ifTrue'] }],
  },
  {
    name: 'a parameter by two aliases keeps the later',
    input: { operator: 'regex', string: 'xyz', value: 'abc', pattern: 'b' },
    expected: { operator: 'REGEX', testString: 'abc', pattern: 'b' },
    issues: [{ code: 'overridden-value', path: ['string'] }],
  },

  // `type`
  {
    name: "PLUS's `type` is its parameter",
    input: { operator: '+', values: [1, 2], type: 'string' },
    expected: { operator: 'PLUS', values: [1, 2], type: 'string' },
  },
  {
    name: '`type` is spelled `outputType`',
    input: { operator: 'getData', property: 'n', type: 'string' },
    expected: { operator: 'OBJECT_PROPERTIES', property: 'n', outputType: 'string' },
  },
  {
    name: '`type` beside `outputType` was never read',
    input: { operator: 'getData', property: 'n', type: 'string', outputType: 'number' },
    expected: { operator: 'OBJECT_PROPERTIES', property: 'n', outputType: 'number' },
    issues: [{ code: 'overridden-value', path: ['type'] }],
  },
  {
    name: 'PLUS keeps both: its `type` also coerced',
    input: { operator: '+', values: [1, 2], type: 'string', outputType: 'number' },
    expected: { operator: 'PLUS', values: [1, 2], type: 'string', outputType: 'number' },
  },
  {
    name: "SQL's `type` rider becomes `flatten`, and the output type",
    input: { operator: 'sql', query: 'SELECT 1', type: 'array' },
    expected: { operator: 'SQL', query: 'SELECT 1', flatten: true, outputType: 'array' },
  },
  {
    name: "SQL's `type` rider beside `outputType`",
    input: { operator: 'sql', query: 'SELECT 1', type: 'array', outputType: 'string' },
    expected: { operator: 'SQL', query: 'SELECT 1', flatten: true, outputType: 'string' },
  },
  {
    name: "SQL's `type` rider beats an explicit `flatten`",
    input: { operator: 'sql', query: 'SELECT 1', flatten: false, type: 'number' },
    expected: { operator: 'SQL', query: 'SELECT 1', flatten: true, outputType: 'number' },
    issues: [{ code: 'overridden-value', path: ['flatten'] }],
  },
  {
    name: "SQL's non-rider `type` beside `outputType` was never read",
    input: { operator: 'sql', query: 'SELECT 1', type: 'boolean', outputType: 'string' },
    expected: { operator: 'SQL', query: 'SELECT 1', outputType: 'string' },
    issues: [{ code: 'overridden-value', path: ['type'] }],
  },
  {
    name: "SQL's non-rider `type` alone is the output type",
    input: { operator: 'sql', query: 'SELECT 1', type: 'boolean' },
    expected: { operator: 'SQL', query: 'SELECT 1', outputType: 'boolean' },
  },
  {
    name: "SQL's computed `type` stays, normalized",
    input: { operator: 'sql', query: 'SELECT 1', type: { $getData: 't' } },
    expected: {
      operator: 'SQL',
      query: 'SELECT 1',
      type: { operator: 'OBJECT_PROPERTIES', property: 't' },
    },
  },

  // `children`
  {
    name: '`children` into one parameter',
    input: { operator: '+', children: [1, 2] },
    expected: { operator: 'PLUS', values: [1, 2] },
  },
  {
    name: '`children` by position',
    input: { operator: '?', children: [true, 'a', 'b'] },
    expected: { operator: 'CONDITIONAL', condition: true, valueIfTrue: 'a', valueIfFalse: 'b' },
  },
  {
    name: 'a missing child still overrides the named parameter',
    input: { operator: '?', children: [false, 'a'], valueIfFalse: 'b' },
    expected: { operator: 'CONDITIONAL', condition: false, valueIfTrue: 'a' },
    issues: [{ code: 'overridden-value', path: ['valueIfFalse'] }],
  },
  {
    name: 'a computed `children` into one parameter',
    input: { operator: '+', children: { $getData: 'list' } },
    expected: { operator: 'PLUS', values: { operator: 'OBJECT_PROPERTIES', property: 'list' } },
  },
  {
    name: 'a computed `children` overrides the named parameter',
    input: { operator: '+', children: { $getData: 'list' }, values: [9] },
    expected: { operator: 'PLUS', values: { operator: 'OBJECT_PROPERTIES', property: 'list' } },
    issues: [{ code: 'overridden-value', path: ['values'] }],
  },
  {
    name: 'a computed `children` that cannot be split is left as written',
    input: { operator: '?', ifTrue: 'x', children: '$c', $c: [true, 1, 2] },
    expected: { operator: '?', ifTrue: 'x', children: '$c', $c: [true, 1, 2] },
  },
  {
    name: "OBJECT_PROPERTIES' second child is the node's fallback",
    input: { operator: 'getData', children: ['nope', 'fb'], fallback: 'own' },
    expected: { operator: 'OBJECT_PROPERTIES', property: 'nope', fallback: 'fb' },
    issues: [{ code: 'overridden-value', path: ['fallback'] }],
  },
  {
    name: "SPLIT's default delimiter overrides the named one",
    input: { operator: 'split', children: ['a b'], delimiter: ',' },
    expected: { operator: 'SPLIT', value: 'a b', delimiter: ' ' },
    issues: [{ code: 'overridden-value', path: ['delimiter'] }],
  },
  {
    name: 'positions and the rest',
    input: { operator: 'stringSubstitution', children: ['%1 and %2', 'a', { $plus: ['b', 'c'] }] },
    expected: {
      operator: 'STRING_SUBSTITUTION',
      string: '%1 and %2',
      substitutions: ['a', { operator: 'PLUS', values: ['b', 'c'] }],
    },
  },
  {
    name: "MATCH's `children`",
    input: { operator: 'match', children: ['b', 'a', 1, 'b', 2] },
    expected: { operator: 'MATCH', matchExpression: 'b', branches: { a: 1, b: 2 } },
  },
  {
    name: "BUILD_OBJECT's alternating `children`",
    input: { operator: 'buildObject', children: ['a', 1, 'b', { $plus: [1, 2] }] },
    expected: {
      operator: 'BUILD_OBJECT',
      properties: [
        { key: 'a', value: 1 },
        { key: 'b', value: { operator: 'PLUS', values: [1, 2] } },
      ],
    },
  },
  {
    name: "BUILD_OBJECT's `children` as entries",
    input: { operator: 'buildObject', children: [{ key: 'a', value: { $plus: [1, 2] } }] },
    expected: {
      operator: 'BUILD_OBJECT',
      properties: [{ key: 'a', value: { operator: 'PLUS', values: [1, 2] } }],
    },
  },
  {
    name: "GET's `children`",
    input: {
      operator: 'GET',
      children: ['https://x.test', ['a', 'b'], 1, { $plus: [1, 1] }, 'params'],
    },
    expected: {
      operator: 'GET',
      url: 'https://x.test',
      returnProperty: 'params',
      parameters: { a: 1, b: { operator: 'PLUS', values: [1, 1] } },
    },
  },
  {
    name: "GRAPHQL's `children`",
    input: { operator: 'graphQL', children: ['query { a }', 'https://g.test', ['v'], 1, 'body'] },
    expected: {
      operator: 'GRAPHQL',
      query: 'query { a }',
      url: 'https://g.test',
      variables: { v: 1 },
      returnNode: 'body',
    },
  },
  {
    name: "PASSTHRU's single child",
    input: { operator: 'pass', children: [{ $plus: [1, 2] }] },
    expected: { operator: 'PASSTHRU', value: { operator: 'PLUS', values: [1, 2] } },
  },
  {
    name: "PASSTHRU's several children",
    input: { operator: 'pass', children: [1, 2] },
    expected: { operator: 'PASSTHRU', value: [1, 2] },
  },
  {
    name: "CUSTOM_FUNCTIONS' `children`",
    input: { operator: 'customFunctions', children: ['echo', 1, 2] },
    expected: { operator: 'CUSTOM_FUNCTIONS', functionName: 'echo', args: [1, 2] },
  },

  // MATCH's branches
  {
    name: 'branches on the node go into `branches`',
    input: { operator: 'match', matchExpression: 'a', a: 1, b: { $plus: [1, 1] } },
    expected: {
      operator: 'MATCH',
      matchExpression: 'a',
      branches: { a: 1, b: { operator: 'PLUS', values: [1, 1] } },
    },
  },
  {
    name: "a key in `branches` beats the node's own",
    input: { operator: 'match', matchExpression: 'a', branches: { a: 1 }, a: 9, b: 2 },
    expected: { operator: 'MATCH', matchExpression: 'a', branches: { a: 1, b: 2 } },
    issues: [{ code: 'overridden-value', path: ['a'] }],
  },
  {
    name: "a `fallback` in `branches` makes the node's branches unreachable",
    input: { operator: 'match', matchExpression: 'b', branches: { a: 1, fallback: 'fb' }, b: 2 },
    expected: { operator: 'MATCH', matchExpression: 'b', branches: { a: 1, fallback: 'fb' } },
    issues: [{ code: 'unreachable-branches', path: ['b'] }],
  },
  {
    name: 'branches on the node join an array of branches',
    input: { operator: 'match', matchExpression: 'b', branches: ['a', 1, 'c', 3], b: 2, c: 9 },
    expected: { operator: 'MATCH', matchExpression: 'b', branches: ['a', 1, 'c', 3, 'b', 2] },
    issues: [{ code: 'overridden-value', path: ['c'] }],
  },
  {
    name: 'branches on the node stay beside a computed `branches`',
    input: {
      operator: 'match',
      matchExpression: 'b',
      branches: { operator: 'buildObject', properties: [{ key: 'a', value: 1 }] },
      b: { $plus: [1, 1] },
    },
    expected: {
      operator: 'MATCH',
      matchExpression: 'b',
      branches: { operator: 'BUILD_OBJECT', properties: [{ key: 'a', value: 1 }] },
      b: { operator: 'PLUS', values: [1, 1] },
    },
  },
  {
    name: 'MATCH did not read `branches` as shorthand',
    input: { operator: 'match', matchExpression: '$getData', branches: { $getData: 'x', a: 'A' } },
    expected: {
      operator: 'MATCH',
      matchExpression: '$getData',
      branches: { $getData: 'x', a: 'A' },
    },
  },
  {
    name: 'branch values are normalized',
    input: { operator: 'switch', matchValue: 'a', cases: { a: { $plus: [1, 2] } } },
    expected: {
      operator: 'MATCH',
      matchExpression: 'a',
      branches: { a: { operator: 'PLUS', values: [1, 2] } },
    },
  },

  // Custom functions
  {
    name: 'the explicit form, with aliases',
    input: { operator: 'customFunctions', function: 'echo', arguments: [1, 2] },
    expected: { operator: 'CUSTOM_FUNCTIONS', functionName: 'echo', args: [1, 2] },
  },
  {
    name: '`operator` naming a function',
    input: { operator: 'echo', args: [1] },
    expected: { operator: 'CUSTOM_FUNCTIONS', functionName: 'echo', args: [1] },
  },
  {
    name: "a function call's undeclared keys go into `input`",
    input: { operator: 'echo', a: 1, b: { $plus: [1, 2] }, $n: 3 },
    expected: {
      operator: 'CUSTOM_FUNCTIONS',
      functionName: 'echo',
      input: { a: 1, b: { operator: 'PLUS', values: [1, 2] }, $n: 3 },
    },
  },
  {
    name: 'beside an `input`, the undeclared keys were discarded',
    input: { operator: 'echo', input: { a: 1 }, comment: 'x', $n: 5, args: ['$n'] },
    expected: { operator: 'CUSTOM_FUNCTIONS', functionName: 'echo', args: ['$n'], input: { a: 1 } },
  },
  {
    name: 'a function named like a v2 operator wins in `operator`',
    input: { operator: 'count', values: [1] },
    expected: { operator: 'CUSTOM_FUNCTIONS', functionName: 'count', input: { values: [1] } },
  },
  {
    name: 'the v2 operator wins in shorthand',
    input: { $count: [1, 2] },
    expected: { operator: 'COUNT', values: [1, 2] },
  },
  {
    name: 'a function shorthand with an array',
    input: { $echo: [1, { $plus: [1, 1] }] },
    expected: {
      operator: 'CUSTOM_FUNCTIONS',
      functionName: 'echo',
      args: [1, { operator: 'PLUS', values: [1, 1] }],
    },
  },
  {
    name: 'a function shorthand with a single value',
    input: { $echo: 5 },
    expected: { operator: 'CUSTOM_FUNCTIONS', functionName: 'echo', args: [5] },
  },
  {
    name: 'a function shorthand with an object',
    input: { $echo: { a: 1 } },
    expected: { operator: 'CUSTOM_FUNCTIONS', functionName: 'echo', input: { a: 1 } },
  },
  {
    name: 'a function shorthand with `input` and `args`',
    input: { $echo: { input: { a: 1 }, args: [2], fallback: 'fb' } },
    expected: {
      operator: 'CUSTOM_FUNCTIONS',
      functionName: 'echo',
      args: [2],
      input: { a: 1 },
      fallback: 'fb',
    },
  },
  {
    name: "a function call's `children` went into `input`",
    input: { operator: 'echo', children: [1, 2] },
    expected: { operator: 'CUSTOM_FUNCTIONS', functionName: 'echo', input: { children: [1, 2] } },
  },
  {
    name: 'a computed `args`',
    input: { operator: 'echo', args: { $getData: 'list' } },
    expected: {
      operator: 'CUSTOM_FUNCTIONS',
      functionName: 'echo',
      args: { operator: 'OBJECT_PROPERTIES', property: 'list' },
    },
  },
  {
    name: "a function call's `type`",
    input: { operator: 'echo', args: [1], type: 'string' },
    expected: {
      operator: 'CUSTOM_FUNCTIONS',
      functionName: 'echo',
      args: [1],
      outputType: 'string',
    },
  },

  // Fragment calls
  {
    name: 'a canonical fragment call',
    input: { fragment: 'adder', parameters: { $values: [1, 2] } },
    expected: { fragment: 'adder', parameters: { $values: [1, 2] } },
  },
  {
    name: 'arguments on the call node move into `parameters`',
    input: { fragment: 'adder', $values: [1, { $plus: [1, 1] }] },
    expected: {
      fragment: 'adder',
      parameters: { $values: [1, { operator: 'PLUS', values: [1, 1] }] },
    },
  },
  {
    name: '`parameters` beats the call node',
    input: { fragment: 'pair', parameters: { $a: 1, $b: 2 }, $a: 5 },
    expected: { fragment: 'pair', parameters: { $a: 1, $b: 2 } },
    issues: [{ code: 'overridden-value', path: ['$a'] }],
  },
  {
    name: "the body's own `$` key beats a call-node argument",
    input: { fragment: 'withDefault', $n: 3 },
    expected: { fragment: 'withDefault', parameters: {} },
    issues: [{ code: 'shadowed-argument', path: ['$n'] }],
  },
  {
    name: "a `parameters` argument beats the body's own",
    input: { fragment: 'withDefault', parameters: { $n: 3 } },
    expected: { fragment: 'withDefault', parameters: { $n: 3 } },
  },
  {
    name: "a shorthand body's own `$` key beats a call-node argument",
    input: { fragment: 'shorthandBody', $n: 5 },
    expected: { fragment: 'shorthandBody', parameters: {} },
    issues: [{ code: 'shadowed-argument', path: ['$n'] }],
  },
  {
    name: 'a fragment shorthand',
    input: { $pair: { $a: 1, $b: 2 } },
    expected: { fragment: 'pair', parameters: { $a: 1, $b: 2 } },
  },
  {
    name: 'a fragment shorthand whose payload is not an object',
    input: { $adder: 5 },
    expected: { fragment: 'adder', parameters: {} },
    issues: [{ code: 'fragment-shorthand-payload', path: ['$adder'] }],
  },
  {
    name: '`fragment` beside `operator` is a fragment call',
    input: { fragment: 'pair', operator: '+', $a: 1, $b: 2 },
    expected: { fragment: 'pair', parameters: { $a: 1, $b: 2 }, operator: '+' },
  },
  {
    name: 'a computed fragment name',
    input: { fragment: { $getData: 'which' }, parameters: { $values: [1, 2] } },
    expected: {
      fragment: { operator: 'OBJECT_PROPERTIES', property: 'which' },
      parameters: { $values: [1, 2] },
    },
  },
  {
    name: 'call-node arguments stay beside a computed `parameters`',
    input: {
      fragment: 'pair',
      parameters: { operator: 'buildObject', properties: [{ key: '$a', value: 1 }] },
      $b: 2,
    },
    expected: {
      fragment: 'pair',
      parameters: { operator: 'BUILD_OBJECT', properties: [{ key: '$a', value: 1 }] },
      $b: 2,
    },
  },
  {
    name: "a call's `fallback` is normalized",
    input: { fragment: 'nope', fallback: { $plus: [1, 2] } },
    expected: {
      fragment: 'nope',
      parameters: {},
      fallback: { operator: 'PLUS', values: [1, 2] },
    },
  },
  {
    name: "a call's `type` stays as written",
    input: { fragment: 'plusBody', type: 'string' },
    expected: { fragment: 'plusBody', parameters: {}, type: 'string' },
  },
  {
    name: 'a call on a body that is not an operator node',
    input: { fragment: 'constant', $x: 1 },
    expected: { fragment: 'constant', parameters: { $x: 1 } },
  },
  {
    name: 'a call inside a node, reading an alias from its caller',
    input: { operator: '+', $n: 5, values: [{ fragment: 'reader' }, 100] },
    expected: {
      operator: 'PLUS',
      values: [{ fragment: 'reader', parameters: {} }, 100],
      $n: 5,
    },
  },

  // Where it looks
  {
    name: 'a plain object is data',
    input: { operator: 'pass', value: { a: { $plus: [1, 2] } } },
    expected: { operator: 'PASSTHRU', value: { a: { $plus: [1, 2] } } },
  },
  {
    name: 'with `evaluateFullObject`, plain objects are walked',
    input: { operator: 'pass', value: { a: { $plus: [1, 2] } } },
    options: { evaluateFullObject: true },
    expected: { operator: 'PASSTHRU', value: { a: { operator: 'PLUS', values: [1, 2] } } },
  },
  {
    name: 'with `evaluateFullObject`, `$` keys on a plain object are definitions',
    input: { $n: 5, a: '$n', b: { $plus: [1, 2] } },
    options: { evaluateFullObject: true },
    expected: { $n: 5, a: '$n', b: { operator: 'PLUS', values: [1, 2] } },
  },
  {
    name: "keys an operator didn't declare are data",
    input: { operator: '+', values: [1, 2], note: { $plus: [1] } },
    expected: { operator: 'PLUS', values: [1, 2], note: { $plus: [1] } },
  },
  {
    name: "GET's `parameters` and `headers` have their values evaluated",
    input: {
      operator: 'GET',
      url: 'https://x.test',
      parameters: { q: { $getData: 'n' } },
      headers: { h: { $getData: 't' } },
    },
    expected: {
      operator: 'GET',
      url: 'https://x.test',
      headers: { h: { operator: 'OBJECT_PROPERTIES', property: 't' } },
      parameters: { q: { operator: 'OBJECT_PROPERTIES', property: 'n' } },
    },
  },
  {
    name: "GRAPHQL's `variables` have their values evaluated, and its `headers` not",
    input: {
      operator: 'graphQL',
      query: 'query { a }',
      variables: { v: { $getData: 'n' } },
      headers: { h: { $getData: 't' } },
    },
    expected: {
      operator: 'GRAPHQL',
      query: 'query { a }',
      headers: { h: { $getData: 't' } },
      variables: { v: { operator: 'OBJECT_PROPERTIES', property: 'n' } },
    },
  },
  {
    name: "POST's `data` alias",
    input: { operator: 'post', url: 'https://x.test', data: { a: { $plus: [1, 2] } } },
    expected: {
      operator: 'POST',
      url: 'https://x.test',
      parameters: { a: { operator: 'PLUS', values: [1, 2] } },
    },
  },
  {
    name: "BUILD_OBJECT's entries have their `key` and `value` evaluated",
    input: {
      operator: 'buildObject',
      properties: [{ key: { $plus: ['a', 'b'] }, value: { $plus: [1, 2] }, note: { $plus: [1] } }],
    },
    expected: {
      operator: 'BUILD_OBJECT',
      properties: [
        {
          key: { operator: 'PLUS', values: ['a', 'b'] },
          value: { operator: 'PLUS', values: [1, 2] },
          note: { $plus: [1] },
        },
      ],
    },
  },
  {
    name: "CUSTOM_FUNCTIONS' `input` has its values evaluated",
    input: { operator: 'customFunctions', functionName: 'echo', input: { a: { $plus: [1, 2] } } },
    expected: {
      operator: 'CUSTOM_FUNCTIONS',
      functionName: 'echo',
      input: { a: { operator: 'PLUS', values: [1, 2] } },
    },
  },
  {
    name: "STRING_SUBSTITUTION's named `substitutions` have their values evaluated",
    input: {
      operator: 'stringSubstitution',
      string: '{{a}} {{b}}',
      substitutions: { a: { $plus: [1, 2] }, b: 'x', $c: { $plus: [1] } },
    },
    expected: {
      operator: 'STRING_SUBSTITUTION',
      string: '{{a}} {{b}}',
      substitutions: { a: { operator: 'PLUS', values: [1, 2] }, b: 'x', $c: { $plus: [1] } },
    },
  },
  {
    name: 'a computed `functionName` is left as written',
    input: { operator: 'customFunctions', functionName: { $plus: ['ec', 'ho'] }, args: [1] },
    expected: { operator: 'customFunctions', functionName: { $plus: ['ec', 'ho'] }, args: [1] },
  },
  {
    name: 'a `functionName` read from an alias is computed',
    input: { operator: 'functions', $f: 'echo', name: '$f', args: [{ $plus: [1] }] },
    expected: { operator: 'functions', $f: 'echo', name: '$f', args: [{ $plus: [1] }] },
  },
  {
    name: 'arrays are evaluated element by element',
    input: [{ $plus: [1, 2] }, 3, [{ $length: [1] }]],
    expected: [{ operator: 'PLUS', values: [1, 2] }, 3, [{ operator: 'COUNT', values: [1] }]],
  },
  {
    name: 'alias definitions and `fallback` are normalized',
    input: {
      operator: 'getData',
      property: 'nope',
      $a: { $plus: [1, 2] },
      fallback: { $plus: ['$a', 1] },
    },
    expected: {
      operator: 'OBJECT_PROPERTIES',
      property: 'nope',
      fallback: { operator: 'PLUS', values: ['$a', 1] },
      $a: { operator: 'PLUS', values: [1, 2] },
    },
  },
  {
    name: 'one object used in two places',
    input: { operator: '+', values: [node, node] },
    expected: {
      operator: 'PLUS',
      values: [
        { operator: 'PLUS', values: [1, 2] },
        { operator: 'PLUS', values: [1, 2] },
      ],
    },
  },
]

describe('each example comes out canonical, and evaluates in v2 as the input did', () => {
  test.each(EXAMPLES)('$name', async ({ input, options, expected, issues = [] }) => {
    const all = optionsFor(options)
    const result = normalize(input, options)

    expect(canonicalViolations(result.expression, all)).toEqual([])
    if (expected !== undefined) expect(result.expression).toEqual(expected)
    expect(result.issues.map(({ code, path }) => ({ code, path }))).toEqual(issues)
    expect(await v2(result.expression, all)).toEqual(await v2(input, all))

    // Canonical v2 is a fixed point
    const again = normalizeV2(result.expression, all)
    expect(again.expression).toEqual(result.expression)
    expect(again.issues).toEqual([])
  })

  test.each(Object.keys(V2_PARAMETERS))('the canonical name %s stays', (operator) => {
    expect(normalize({ operator }).expression).toEqual({ operator })
  })
})

test("a shorthand whose node can't be read is left as written, with nothing reported", async () => {
  // The payload's own `operator` replaced COUNT, and names no v2 operator. The
  // checker cannot see that the shorthand object is a node left as written.
  const input = { $length: { operator: 'nope' } }
  const result = normalize(input)
  expect(result.expression).toEqual(input)
  expect(result.issues).toEqual([])
  expect(await v2(result.expression, optionsFor())).toEqual(await v2(input, optionsFor()))
})

test('the one expected difference: a call-node argument named after a v2 operator', async () => {
  // v2 read a `parameters` object holding `$count` as COUNT shorthand, so the
  // argument moved there never arrives ("Stage 1: normalize")
  const input = { fragment: 'counter', $count: 5 }
  const { expression } = normalize(input)
  expect(expression).toEqual({ fragment: 'counter', parameters: { $count: 5 } })
  expect(await v2(input, optionsFor())).toEqual({ value: 6 })
  expect(await v2(expression, optionsFor())).toEqual({ value: '$count1' })
})

describe('issues', () => {
  test('each carries its tag and a message', () => {
    const { issues } = normalize({ $plus: { values: [1, 2] }, values: [3, 4] })
    expect(issues).toEqual([
      {
        code: 'overridden-value',
        tag: 'lossy-default',
        path: ['$plus', 'values'],
        message: 'v2 never read `$plus.values`: `values` gave the same parameter and won. Removed.',
      },
    ])
  })

  test('a value is reported once, however many of its keys lost', () => {
    const { issues } = normalize({ $plus: { values: [1, 2] }, $multiply: { values: [3, 4] } })
    expect(issues.map(({ path }) => path)).toEqual([['$plus']])
  })

  test('the winner is named where the value came from', () => {
    const children = normalize({ operator: '?', children: [true, 'a'], valueIfFalse: 'b' })
    expect(children.issues[0].message).toContain('`children` gave')
    const branches = normalize({
      operator: 'match',
      matchExpression: 'a',
      branches: { a: 1 },
      a: 9,
    })
    expect(branches.issues[0].message).toContain('`branches.a` gave')
  })

  test('the fragment and argument are named in a shadowed argument', () => {
    const { issues } = normalize({ fragment: 'withDefault', $n: 3 })
    expect(issues[0].message).toBe(
      'The body of `withDefault` sets its own `$n`, which beat this argument in v2, so the argument never applied. Removed.'
    )
  })
})

describe('source paths', () => {
  const recordOf = (input: unknown, at: (expression: unknown) => unknown = (e) => e) => {
    const { expression, sources } = normalize(input)
    return sources.get(at(expression) as object)
  }
  type Tree = Record<string, never> & Record<string | number, unknown>
  const get =
    (...path: Path) =>
    (expression: unknown) =>
      path.reduce<unknown>((value, key) => (value as Tree)[key], expression)

  test("a shorthand node's parameters report at the `$` key", () => {
    expect(recordOf({ $plus: [1, 2] })).toEqual({
      path: [],
      keys: { operator: ['$plus'], values: ['$plus'] },
    })
  })

  test('a parameter taken from `children` reports at its child', () => {
    expect(recordOf({ operator: '?', children: [true, 'a', 'b'] })?.keys).toEqual({
      operator: ['operator'],
      condition: ['children', 0],
      valueIfTrue: ['children', 1],
      valueIfFalse: ['children', 2],
    })
    expect(recordOf({ $conditional: [true, 'a', 'b'] })?.keys.valueIfTrue).toEqual([
      '$conditional',
      1,
    ])
  })

  test('a parameter given by alias reports at the alias', () => {
    const record = recordOf({ operator: '?', condition: true, ifTrue: 'a', valueIfFalse: 'b' })
    expect(record?.keys.valueIfTrue).toEqual(['ifTrue'])
  })

  test("MATCH's branches from the node report at their keys", () => {
    const input = { operator: 'match', matchExpression: 'a', a: 1, branches: { b: 2 } }
    expect(recordOf(input, get('branches'))).toEqual({
      path: ['branches'],
      keys: { b: ['branches', 'b'], a: ['a'] },
    })
    expect(recordOf({ operator: 'match', matchExpression: 'a', a: 1 })?.keys.branches).toEqual([])
  })

  test('a call-node argument reports at its key, and a created `parameters` at the call', () => {
    expect(recordOf({ fragment: 'adder', $values: [1] }, get('parameters'))).toEqual({
      path: [],
      keys: { $values: ['$values'] },
    })
    const both = { fragment: 'pair', parameters: { $a: 1 }, $b: 2 }
    expect(recordOf(both, get('parameters'))).toEqual({
      path: ['parameters'],
      keys: { $a: ['parameters', '$a'], $b: ['$b'] },
    })
  })

  test("a function's gathered `input` reports its keys where they were", () => {
    expect(recordOf({ operator: 'echo', a: 1 }, get('input'))).toEqual({
      path: [],
      keys: { a: ['a'] },
    })
    expect(recordOf({ $echo: 5 }, get('args'))).toEqual({ path: ['$echo'], keys: { 0: ['$echo'] } })
  })

  test('containers built from `children` report their entries at the children', () => {
    const buildObject = { operator: 'buildObject', children: ['a', 1] }
    expect(recordOf(buildObject, get('properties', 0))).toEqual({
      path: ['children'],
      keys: { key: ['children', 0], value: ['children', 1] },
    })
    const request = { operator: 'GET', children: ['https://x.test', ['a', 'b'], 1] }
    expect(recordOf(request, get('parameters'))).toEqual({
      path: ['children'],
      keys: { a: ['children', 2], b: ['children'] },
    })
  })

  test('below a moved value, paths are the input’s', () => {
    const input = { operator: '+', children: [{ $plus: [1] }] }
    expect(recordOf(input, get('values', 0))).toEqual({
      path: ['children', 0],
      keys: { operator: ['children', 0, '$plus'], values: ['children', 0, '$plus'] },
    })
  })

  test('one object used in two places gets a node and a path for each', () => {
    const { expression, sources } = normalize({ operator: '+', values: [node, node] })
    const [first, second] = (expression as { values: object[] }).values
    expect(first).not.toBe(second)
    expect(sources.get(first)?.path).toEqual(['values', 0])
    expect(sources.get(second)?.path).toEqual(['values', 1])
  })

  test('the keys v2 discarded beside a function call’s `input` are kept for `//`', () => {
    const input = { operator: 'echo', input: { a: 1 }, comment: 'x', $n: 5, args: ['$n'] }
    expect(recordOf(input)?.ignored).toEqual({ comment: 'x', $n: 5 })
    expect(recordOf({ operator: 'echo', args: [1] })?.ignored).toBeUndefined()
  })

  test.each(EXAMPLES)('$name: every path is in the input', ({ input, options }) => {
    const { issues, sources } = normalize(input, options)
    for (const { path } of issues) expect([path, hasPath(input, path)]).toEqual([path, true])
    for (const record of sources.values())
      for (const path of [record.path, ...Object.values(record.keys)])
        expect([path, hasPath(input, path)]).toEqual([path, true])
  })

  test.each(EXAMPLES)('$name: every object stage 1 wrote is new', ({ input, options }) => {
    const frozen = deepFreeze(clone(input))
    const seen = new Set<unknown>()
    const collect = (value: unknown) => {
      if (value === null || typeof value !== 'object' || seen.has(value)) return
      seen.add(value)
      Object.values(value).forEach(collect)
    }
    collect(frozen)
    const { sources } = normalizeV2(frozen, optionsFor(options))
    for (const written of sources.keys()) expect(seen.has(written)).toBe(false)
  })
})
