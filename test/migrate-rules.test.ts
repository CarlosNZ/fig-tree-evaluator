/**
 * Phase 15.1 — the v2→v3 rules ("The v2→v3 rules" in
 * docs-dev/v3-specs/v3-converter.md).
 *
 * The checks hold every rule to both tables: each v2 parameter has a fate,
 * and each target is a v3 operator and parameter. Each example converts to
 * the output the spec gives, validates in v3, and evaluates the same in the
 * published v2 package and in v3, or differs as its row says.
 *
 * I/O runs against one scripted response on both sides, and the request each
 * engine sent is compared as well as the result. Custom functions are
 * registered as v3 operators the way the migration guide suggests.
 */
import { FigTree, coreOperators, defineOperator, httpOperators, sqlOperators } from '../src'
import type { V2Options } from '../src/migrationTypes'
import { convertV2 } from '../src/migrate/convert'
import type { IssueCode, Path } from '../src/migrate/issues'
import { V3_RULES, type OperatorRule } from '../src/migrate/rules'
import { isV3Path } from '../src/migrate/v3Values'
import { parsePath } from '../src/primitives'
import { V2_PARAMETERS, type V2Operator } from '../src/migrate/v2/operators.generated'
import { MockHttpClient, MockSqlConnection } from './helpers'
import {
  clone,
  deepFreeze,
  sentRequest,
  v2HttpClient,
  v2Outcome,
  v2SqlConnection,
  v3Errors,
  v3Outcome,
  type Outcome,
  type SentQuery,
  type SentRequest,
} from './helpers/migration'

const v3 = new FigTree({
  operators: [
    coreOperators,
    httpOperators(new MockHttpClient()),
    sqlOperators(new MockSqlConnection()),
  ],
})

describe('the checks', () => {
  const rules = Object.entries(V3_RULES) as [V2Operator, OperatorRule][]

  test('every v2 operator has a rule', () => {
    expect(Object.keys(V3_RULES).sort()).toEqual(Object.keys(V2_PARAMETERS).sort())
  })

  test.each(rules)('%s gives every v2 parameter a fate', (operator, rule) => {
    const declared = V2_PARAMETERS[operator]
      .map(({ name }) => name)
      .filter((name) => name !== 'useCache')
    expect(Object.keys(rule.params).sort()).toEqual(declared.sort())
  })

  // PASSTHRU and CUSTOM_FUNCTIONS name no v3 operator: a `build` writes all
  test.each(rules.filter(([, rule]) => rule.to !== undefined))(
    "%s's targets are v3 operators and parameters",
    (_, rule) => {
      const target = v3.getOperators().find(({ name }) => name === rule.to)
      expect(target).toBeDefined()
      const parameters = Object.keys(target!.parameters)
      for (const fate of Object.values(rule.params)) {
        const name = typeof fate === 'object' ? fate.to : fate
        if (name !== 'consumed' && name !== 'omitted') expect(parameters).toContain(name)
      }
      for (const name of Object.keys(rule.add ?? {})) expect(parameters).toContain(name)
    }
  )

  // The converter cannot import the engine, so it restates the path grammar
  test.each([
    '',
    'a',
    'a.b',
    'a[0].b',
    '[0]',
    'a[*].b',
    'a["x.y"]',
    "a['it\\'s']",
    'a]b',
    'a b.c',
    'a..b',
    'a[',
    'a[x]',
    'a[0',
    'a["x"',
    'a[*',
  ])('the path grammar agrees with v3 on %j', (path) => {
    let parses = true
    try {
      parsePath(path)
    } catch {
      parses = false
    }
    expect(isV3Path(path)).toBe(parses)
  })
})

type Raised = { code: IssueCode; path: Path }

interface Example {
  name: string
  input: unknown
  options?: V2Options
  data?: Record<string, unknown>
  expected: unknown
  issues?: Raised[]
  /** Where the engines differ, each one's outcome */
  differs?: { v2: Outcome; v3: Outcome }
  /** A difference `validate()` reports, which goes to the guide */
  invalid?: true
}

const NOTE = 'v2 conversion: '
const decidingNote = (reason: string, wrote: string, key = 'strict') =>
  `${NOTE}${reason}, so the converter cannot tell what v2 did. It wrote ${wrote}, v2's ` +
  `default. Where \`${key}\` can be otherwise, rewrite the node by hand.`

const BATCH_1: Example[] = [
  // Renames
  {
    name: 'AND over mixed truthy values',
    input: { operator: 'and', values: [true, 1, 'x'] },
    expected: { operator: 'and', values: [true, 1, 'x'] },
  },
  {
    name: 'AND over no values',
    input: { operator: '&', values: [] },
    expected: { operator: 'and', values: [] },
  },
  {
    name: 'OR over falsy values and one truthy',
    input: { operator: 'or', values: [0, '', null, 'y'] },
    expected: { operator: 'or', values: [0, '', null, 'y'] },
  },
  {
    name: 'OR over no values',
    input: { operator: '||', values: [] },
    expected: { operator: 'or', values: [] },
  },
  {
    name: 'MULTIPLY',
    input: { operator: '*', values: [2, 3] },
    expected: { operator: 'multiply', values: [2, 3] },
  },
  {
    name: 'MULTIPLY over no values: the empty product, which validate() warns about',
    input: { operator: '*', values: [] },
    expected: { operator: 'multiply', values: [] },
    differs: { v2: { value: 0 }, v3: { value: 1 } },
  },
  {
    name: 'CONDITIONAL over an empty array, which is truthy in both',
    input: { operator: '?', condition: [], valueIfTrue: 'a', valueIfFalse: 'b' },
    expected: { operator: 'if', condition: [], then: 'a', else: 'b' },
  },
  {
    name: "CONDITIONAL over the text 'false'",
    input: { operator: 'conditional', condition: 'false', ifTrue: 'a', ifFalse: 'b' },
    expected: { operator: 'if', condition: 'false', then: 'a', else: 'b' },
  },
  {
    name: 'REGEX',
    input: { operator: 'regex', testString: 'abc', pattern: '^a' },
    expected: { operator: 'regex', value: 'abc', pattern: '^a' },
  },
  {
    name: 'COUNT',
    input: { operator: 'count', values: [1, 2, 3] },
    expected: { operator: 'length', value: [1, 2, 3] },
  },

  // EQUAL, NOT_EQUAL
  {
    name: 'EQUAL, deep and key-order-insensitive',
    input: {
      operator: '=',
      values: [
        { a: 1, b: [2] },
        { b: [2], a: 1 },
      ],
    },
    expected: {
      operator: 'equal',
      values: [
        { a: 1, b: [2] },
        { b: [2], a: 1 },
      ],
    },
  },
  {
    name: "EQUAL's own `caseInsensitive` carries over",
    input: { operator: '=', values: ['A', 'a'], caseInsensitive: true },
    expected: { operator: 'equal', values: ['A', 'a'], caseInsensitive: true },
  },
  {
    name: "v2's instance-wide `caseInsensitive` does not",
    input: { operator: '=', values: ['A', 'a'] },
    options: { caseInsensitive: true },
    expected: { operator: 'equal', values: ['A', 'a'] },
    issues: [{ code: 'instance-case-insensitive', path: [] }],
    differs: { v2: { value: true }, v3: { value: false } },
  },
  {
    name: "a node's own `caseInsensitive` needs no issue",
    input: { operator: '!=', values: ['A', 'a'], caseInsensitive: false },
    options: { caseInsensitive: true },
    expected: { operator: 'notEqual', values: ['A', 'a'], caseInsensitive: false },
  },
  {
    name: '`nullEqualsUndefined` is omitted, and 2.23.2 answers as v3 does',
    input: { operator: '!=', values: [null, 5], nullEqualsUndefined: true },
    expected: { operator: 'notEqual', values: [null, 5] },
  },

  // GREATER_THAN, LESS_THAN
  {
    name: 'GREATER_THAN',
    input: { operator: '>', values: [5, 3] },
    expected: { operator: 'greaterThan', values: [5, 3] },
  },
  {
    name: '`strict: false` is the inclusive operator',
    input: { operator: '>', values: [3, 3], strict: false },
    expected: { operator: 'greaterThanOrEqual', values: [3, 3] },
  },
  {
    name: '`strict: true` is the strict one',
    input: { operator: '<', values: [3, 3], strict: true },
    expected: { operator: 'lessThan', values: [3, 3] },
  },
  {
    name: 'strings order in both',
    input: { operator: '<', values: ['apple', 'banana'] },
    expected: { operator: 'lessThan', values: ['apple', 'banana'] },
  },
  {
    name: 'values past the second are cut',
    input: { operator: '>', values: [5, 3, 100] },
    expected: { operator: 'greaterThan', values: [5, 3] },
    issues: [{ code: 'values-cut', path: ['values'] }],
  },
  {
    name: 'a computed `strict` is a deciding value',
    input: { operator: 'lessThan', values: [3, 3], strict: { operator: 'and', values: [true] } },
    expected: {
      '//': decidingNote('`strict` is computed', '`lessThan`'),
      operator: 'lessThan',
      values: [3, 3],
    },
    issues: [{ code: 'deciding-value', path: ['strict'] }],
  },
  {
    name: 'a `strict` v2 did not accept is a deciding value',
    input: { operator: '>', values: [5, 3], strict: 'yes' },
    expected: {
      '//': decidingNote("`'yes'` is not a value v2 accepted for `strict`", '`greaterThan`'),
      operator: 'greaterThan',
      values: [5, 3],
    },
    issues: [{ code: 'deciding-value', path: ['strict'] }],
    differs: { v2: { error: true }, v3: { value: true } },
  },
  {
    name: 'mixed types, which v2 coerced: the guide',
    input: { operator: '>', values: [5, '3'] },
    expected: { operator: 'greaterThan', values: [5, '3'] },
    differs: { v2: { value: true }, v3: { error: true } },
    invalid: true,
  },
  {
    name: 'a null operand, which v2 coerced to 0: the guide',
    input: { operator: '<', values: [null, 1] },
    expected: { operator: 'lessThan', values: [null, 1] },
    differs: { v2: { value: true }, v3: { value: null } },
  },

  // SPLIT
  {
    name: 'a trailing delimiter',
    input: { operator: 'split', value: 'a,b,', delimiter: ',' },
    expected: { operator: 'split', value: 'a,b,', delimiter: ',' },
    issues: [{ code: 'split-trailing-empty', path: [] }],
    differs: { v2: { value: ['a', 'b'] }, v3: { value: ['a', 'b', ''] } },
  },
  {
    name: 'an empty string',
    input: { operator: 'split', value: '', delimiter: ',' },
    expected: { operator: 'split', value: '', delimiter: ',' },
    issues: [{ code: 'split-trailing-empty', path: [] }],
    differs: { v2: { value: [] }, v3: { value: [''] } },
  },
  {
    name: 'an empty piece in the middle',
    input: { operator: 'split', value: 'a,,b', separator: ',' },
    expected: { operator: 'split', value: 'a,,b', delimiter: ',' },
    issues: [{ code: 'split-trailing-empty', path: [] }],
  },
  {
    name: 'the default delimiter',
    input: { operator: 'split', value: 'a b' },
    expected: { operator: 'split', value: 'a b' },
    issues: [{ code: 'split-trailing-empty', path: [] }],
  },
  {
    name: '`excludeTrailing: false` kept the empties already',
    input: { operator: 'split', value: 'a,b,', delimiter: ',', excludeTrailing: false },
    expected: { operator: 'split', value: 'a,b,', delimiter: ',' },
  },
  {
    name: '`trimWhiteSpace` is `trim`',
    input: { operator: 'split', value: 'a, b', delimiter: ',', trim: false, removeTrailing: false },
    expected: { operator: 'split', value: 'a, b', delimiter: ',', trim: false },
  },
  {
    name: 'an escape typed in the delimiter is the character it names',
    input: { operator: 'split', value: 'a\nb\tc', delimiter: '\\n', excludeTrailing: false },
    expected: { operator: 'split', value: 'a\nb\tc', delimiter: '\n' },
  },
  {
    name: 'a computed delimiter',
    input: {
      operator: 'split',
      value: 'a;b',
      delimiter: { operator: '?', condition: false, valueIfTrue: ',', valueIfFalse: ';' },
      excludeTrailing: false,
    },
    expected: {
      operator: 'split',
      value: 'a;b',
      delimiter: { operator: 'if', condition: false, then: ',', else: ';' },
    },
    issues: [{ code: 'computed-delimiter', path: ['delimiter'] }],
  },
]

const check = async (example: Example, fig = v3, v2Options: object = {}) => {
  const { input, options = {}, data, expected, issues = [], differs, invalid } = example
  const { expression, issues: raised } = convertV2(deepFreeze(clone(input)), options)

  expect(expression).toEqual(expected)
  expect(raised.map(({ code, path }) => ({ code, path }))).toEqual(issues)
  if (!invalid) expect(v3Errors(fig, expression, data)).toEqual([])

  const v2 = await v2Outcome(input, { ...options, ...v2Options, data })
  const converted = await v3Outcome(fig, expression, data)
  if (differs) expect({ v2, v3: converted }).toEqual(differs)
  else expect(converted).toEqual(v2)
}

describe('batch 1', () => {
  test.each(BATCH_1)('$name', (example) => check(example))
})

const ifNode = (then: unknown, otherwise: unknown) => ({
  operator: '?',
  condition: true,
  valueIfTrue: then,
  valueIfFalse: otherwise,
})
const ifV3 = (then: unknown, otherwise: unknown) => ({
  operator: 'if',
  condition: true,
  then,
  else: otherwise,
})

const BATCH_2: Example[] = [
  // PLUS
  {
    name: 'PLUS sums numbers',
    input: { operator: '+', values: [1, 2] },
    expected: { operator: 'plus', values: [1, 2] },
  },
  {
    name: 'PLUS concatenates strings',
    input: { operator: 'add', values: ['a', 'b'] },
    expected: { operator: 'plus', values: ['a', 'b'] },
  },
  {
    name: 'PLUS concatenates arrays',
    input: { $plus: [[1], [2, 3]] },
    expected: { operator: 'plus', values: [[1], [2, 3]] },
  },
  {
    name: 'PLUS merges objects, later keys winning',
    input: { operator: '+', values: [{ a: 1, b: 1 }, { b: 2 }] },
    expected: { operator: 'plus', values: [{ a: 1, b: 1 }, { b: 2 }] },
  },
  {
    name: 'PLUS over one operand',
    input: { operator: '+', values: [5] },
    expected: { operator: 'plus', values: [5] },
  },
  {
    name: 'a text and a number, which v2 coerced: the guide',
    input: { operator: '+', values: ['a', 5] },
    expected: { operator: 'plus', values: ['a', 5] },
    differs: { v2: { value: 'a5' }, v3: { error: true } },
    invalid: true,
  },
  {
    name: 'a null operand: the null policy',
    input: { operator: '+', values: [1, null] },
    expected: { operator: 'plus', values: [1, null] },
    differs: { v2: { value: 1 }, v3: { value: null } },
  },
  {
    name: 'no operands, which validate() rejects',
    input: { operator: '+', values: [] },
    expected: { operator: 'plus', values: [] },
    differs: { v2: { value: [] }, v3: { error: true } },
    invalid: true,
  },
  {
    name: "`type: 'string'` is `join` with no delimiter",
    input: { operator: '+', values: [1, 2], type: 'string' },
    expected: { operator: 'join', values: [1, 2], delimiter: '' },
  },
  {
    name: "`type: 'string'` over booleans, floats and text",
    input: { operator: '+', values: [true, 1.5, 'x'], type: 'string' },
    expected: { operator: 'join', values: [true, 1.5, 'x'], delimiter: '' },
  },
  {
    name: "`type: 'string'` renders null as '': the guide",
    input: { operator: '+', values: ['a', null], type: 'string' },
    expected: { operator: 'join', values: ['a', null], delimiter: '' },
    differs: { v2: { value: 'anull' }, v3: { value: 'a' } },
  },
  {
    name: "`type: 'array'` wraps each literal operand that is not an array",
    input: { operator: '+', values: [1, [2, 3], 'x', null], type: 'array' },
    expected: { operator: 'plus', values: [[1], [2, 3], ['x'], [null]], expect: 'array' },
  },
  {
    name: "`type: 'array'` over nested arrays",
    input: { operator: '+', values: [[1, [2]], 3], type: 'array' },
    expected: { operator: 'plus', values: [[1, [2]], [3]], expect: 'array' },
  },
  {
    name: "`type: 'array'` leaves a computed operand as it is",
    input: { operator: '+', values: [{ $plus: [[1], [2]] }, 3], type: 'array' },
    expected: {
      operator: 'plus',
      values: [{ operator: 'plus', values: [[1], [2]] }, [3]],
      expect: 'array',
    },
  },
  {
    name: "`type: 'number'` converts the result",
    input: { operator: '+', values: [1, 2], type: 'number' },
    expected: { operator: 'convert', value: { operator: 'plus', values: [1, 2] }, to: 'number' },
    issues: [{ code: 'output-type', path: ['type'] }],
  },
  {
    name: "`type: 'number'` over numeric text, which v2 concatenated and then converted",
    input: { operator: '+', values: ['5', '6'], type: 'number' },
    expected: {
      operator: 'convert',
      value: { operator: 'plus', values: ['5', '6'] },
      to: 'number',
    },
    issues: [{ code: 'output-type', path: ['type'] }],
  },
  {
    name: "`type: 'number'` over text with no number, which v2 mined: the issue's",
    input: { operator: '+', values: ['a', 'b'], type: 'number' },
    expected: {
      operator: 'convert',
      value: { operator: 'plus', values: ['a', 'b'] },
      to: 'number',
    },
    issues: [{ code: 'output-type', path: ['type'] }],
    differs: { v2: { value: 0 }, v3: { error: true } },
  },
  {
    name: "`type: 'number'` beside the node's own `outputType`, which wins",
    input: { operator: '+', values: ['5', '6'], type: 'number', outputType: 'string' },
    expected: {
      operator: 'convert',
      value: { operator: 'plus', values: ['5', '6'] },
      to: 'string',
    },
    issues: [{ code: 'output-type', path: ['outputType'] }],
  },
  {
    name: "`type: 'boolean'` converts the result",
    input: { operator: '+', values: [1, -1], type: 'boolean' },
    expected: { operator: 'convert', value: { operator: 'plus', values: [1, -1] }, to: 'boolean' },
    issues: [{ code: 'output-type', path: ['type'] }],
  },
  {
    name: "`type: 'bool'`",
    input: { operator: '+', values: [1, 1], type: 'bool' },
    expected: { operator: 'convert', value: { operator: 'plus', values: [1, 1] }, to: 'boolean' },
    issues: [{ code: 'output-type', path: ['type'] }],
  },
  {
    name: "the node's own `outputType` wins, and `type` only coerces",
    input: { operator: '+', values: [1, 2], type: 'string', outputType: 'number' },
    expected: {
      operator: 'convert',
      value: { operator: 'join', values: [1, 2], delimiter: '' },
      to: 'number',
    },
    issues: [{ code: 'output-type', path: ['outputType'] }],
  },
  {
    name: 'a computed `type` is a deciding value',
    input: { operator: '+', values: [1, 2], type: ifNode('string', 'array') },
    expected: {
      '//': decidingNote('`type` is computed', '`plus`', 'type'),
      operator: 'plus',
      values: [1, 2],
    },
    issues: [{ code: 'deciding-value', path: ['type'] }],
    differs: { v2: { error: true }, v3: { value: 3 } },
  },
  {
    name: 'a `type` v2 did not accept is a deciding value',
    input: { operator: '+', values: [1, 2], type: 'integer' },
    expected: {
      '//': decidingNote("`'integer'` is not a value v2 accepted for `type`", '`plus`', 'type'),
      operator: 'plus',
      values: [1, 2],
    },
    issues: [{ code: 'deciding-value', path: ['type'] }],
    differs: { v2: { error: true }, v3: { value: 3 } },
  },

  // SUBTRACT
  {
    name: 'SUBTRACT over `values`',
    input: { operator: '-', values: [10, 3] },
    expected: { operator: 'subtract', value: 10, minus: 3 },
  },
  {
    name: 'SUBTRACT over the named pair',
    input: { operator: 'subtract', subtractFrom: 10, subtract: 3 },
    expected: { operator: 'subtract', value: 10, minus: 3 },
  },
  {
    name: '`values` beats the named pair, which v2 never read',
    input: { operator: '-', values: [10, 3], from: 1, subtract: 1 },
    expected: { operator: 'subtract', value: 10, minus: 3 },
    issues: [
      { code: 'overridden-value', path: ['from'] },
      { code: 'overridden-value', path: ['subtract'] },
    ],
  },
  {
    name: 'values past the second are cut',
    input: { operator: '-', values: [10, 3, 2] },
    expected: { operator: 'subtract', value: 10, minus: 3 },
    issues: [{ code: 'values-cut', path: ['values'] }],
  },
  {
    name: 'a computed `values` is bound once and indexed',
    input: { operator: '-', values: ifNode([10, 3], [0, 0]) },
    expected: {
      operator: 'subtract',
      value: '$vars.values[0]',
      minus: '$vars.values[1]',
      vars: { values: ifV3([10, 3], [0, 0]) },
    },
  },
  {
    name: 'a reference is indexed as it is',
    input: { operator: '-', $v: [10, 3], values: '$v' },
    expected: {
      operator: 'subtract',
      value: '$vars.v[0]',
      minus: '$vars.v[1]',
      vars: { v: [10, 3] },
    },
  },
  {
    name: 'the bound var takes a name the node does not use',
    input: { operator: '-', $values: 1, values: ifNode(['$values', 3], [0, 0]) },
    expected: {
      operator: 'subtract',
      value: '$vars.values_2[0]',
      minus: '$vars.values_2[1]',
      vars: { values: 1, values_2: ifV3(['$vars.values', 3], [0, 0]) },
    },
  },

  // DIVIDE
  {
    name: 'DIVIDE over `values`',
    input: { operator: '/', values: [10, 4] },
    expected: { operator: 'divide', value: 10, by: 4 },
  },
  {
    name: 'DIVIDE over the named pair',
    input: { operator: 'divide', divide: 10, divideBy: 4 },
    expected: { operator: 'divide', value: 10, by: 4 },
  },
  {
    name: "`output: 'decimal'`, from 2.23.2, is v2's default",
    input: { operator: '/', values: [10, 4], output: 'decimal' },
    expected: { operator: 'divide', value: 10, by: 4 },
  },
  {
    name: "`output: 'quotient'` is the floor",
    input: { operator: '/', values: [7, 2], output: 'quotient' },
    expected: { operator: 'floor', value: { operator: 'divide', value: 7, by: 2 } },
  },
  {
    name: "`output: 'quotient'` over a negative value",
    input: { operator: '/', values: [-7, 2], output: 'quotient' },
    expected: { operator: 'floor', value: { operator: 'divide', value: -7, by: 2 } },
  },
  {
    name: "`output: 'remainder'` is `modulo`, the same where the signs agree",
    input: { operator: '/', values: [7, 3], output: 'remainder' },
    expected: { operator: 'modulo', value: 7, mod: 3 },
    issues: [{ code: 'remainder-sign', path: ['output'] }],
  },
  {
    name: "`output: 'remainder'` where one operand is negative",
    input: { operator: '/', values: [-7, 3], output: 'remainder' },
    expected: { operator: 'modulo', value: -7, mod: 3 },
    issues: [{ code: 'remainder-sign', path: ['output'] }],
    differs: { v2: { value: -1 }, v3: { value: 2 } },
  },
  {
    name: 'an `output` v2 did not accept is a deciding value',
    input: { operator: '/', values: [10, 4], output: 'nope' },
    expected: {
      '//': decidingNote("`'nope'` is not a value v2 accepted for `output`", '`divide`', 'output'),
      operator: 'divide',
      value: 10,
      by: 4,
    },
    issues: [{ code: 'deciding-value', path: ['output'] }],
    differs: { v2: { error: true }, v3: { value: 2.5 } },
  },
  {
    name: "a computed `values` under `'quotient'` is bound on the outer node",
    input: { operator: '/', values: ifNode([7, 2], [1, 1]), output: 'quotient' },
    expected: {
      operator: 'floor',
      value: { operator: 'divide', value: '$vars.values[0]', by: '$vars.values[1]' },
      vars: { values: ifV3([7, 2], [1, 1]) },
    },
  },
  {
    name: 'division by zero fails in both',
    input: { operator: '/', values: [1, { $getData: 'zero' }] },
    data: { zero: 0 },
    expected: { operator: 'divide', value: 1, by: '$data.zero' },
  },
]

describe('batch 2', () => {
  test.each(BATCH_2)('$name', (example) => check(example))
})

const DATA = {
  user: { name: 'Ann', friends: [{ name: 'Bo' }, { name: 'Cy' }] },
  n: 7,
  x: null,
  count: 2,
  key: 'b',
  field: 'n',
  entry: { key: 'a', value: 1 },
}

const BATCH_3: Example[] = [
  // OBJECT_PROPERTIES
  {
    name: 'a literal path is a reference',
    input: { operator: 'getData', property: 'user.name' },
    expected: '$data.user.name',
  },
  {
    name: 'an indexed path',
    input: { operator: 'objProps', path: 'user.friends[1].name' },
    expected: '$data.user.friends[1].name',
  },
  {
    name: 'an empty path is the whole of `data`',
    input: { operator: 'getData', property: '' },
    expected: '$data',
  },
  {
    name: 'a stored null',
    input: { operator: 'getData', property: 'x' },
    expected: '$data.x',
  },
  {
    name: 'a missing path, which v2 failed on',
    input: { operator: 'getData', property: 'nope' },
    expected: '$data.nope',
    differs: { v2: { error: true }, v3: { value: null } },
  },
  {
    name: 'a computed path is a `get`',
    input: { operator: 'getData', property: { operator: 'getData', property: 'field' } },
    expected: { operator: 'get', path: '$data.field' },
  },
  {
    name: 'a path from an enclosing alias is a `get`',
    input: { operator: '+', $p: 'n', values: [{ operator: 'getData', property: '$p' }, 1] },
    expected: {
      operator: 'plus',
      values: [{ operator: 'get', path: '$vars.p' }, 1],
      vars: { p: 'n' },
    },
  },
  {
    name: 'a `fallback` is the missing-path default',
    input: { operator: 'getData', property: 'nope', fallback: 'none' },
    expected: { operator: 'get', path: 'nope', missingPathDefault: 'none' },
  },
  {
    name: 'the second child is the `fallback`',
    input: { operator: 'getData', children: ['nope', 'none'] },
    expected: { operator: 'get', path: 'nope', missingPathDefault: 'none' },
  },
  {
    name: '`additionalData` is merged over `data`',
    input: { operator: 'getData', property: 'n', additionalData: { n: 8 } },
    expected: {
      operator: 'get',
      path: 'n',
      from: { operator: 'plus', values: ['$data', { n: 8 }] },
    },
  },
  {
    name: '`additionalData` leaves the rest of `data`',
    input: { operator: 'getData', property: 'user.name', objects: { m: 1 } },
    expected: {
      operator: 'get',
      path: 'user.name',
      from: { operator: 'plus', values: ['$data', { m: 1 }] },
    },
  },
  {
    name: 'a computed path',
    input: { operator: 'getData', property: { $plus: ['user.', 'name'] } },
    expected: { operator: 'get', path: { operator: 'plus', values: ['user.', 'name'] } },
  },
  {
    name: 'a path read from an alias',
    input: { operator: 'getData', $p: 'user.name', property: '$p' },
    expected: { operator: 'get', path: '$vars.p', vars: { p: 'user.name' } },
  },
  {
    name: 'alias definitions to carry',
    input: { operator: 'getData', $a: 1, property: 'n' },
    expected: { operator: 'get', path: 'n', vars: { a: 1 } },
  },
  {
    name: 'a path v3 cannot parse, which validate() reports',
    input: { operator: 'getData', property: 'user[' },
    expected: { operator: 'get', path: 'user[' },
    invalid: true,
  },
  {
    name: 'an `outputType` wraps the reference',
    input: { operator: 'getData', property: 'n', outputType: 'string' },
    expected: { operator: 'convert', value: '$data.n', to: 'string' },
    issues: [{ code: 'output-type', path: ['outputType'] }],
  },

  // STRING_SUBSTITUTION, positional
  {
    name: 'a positional template',
    input: { operator: 'stringSubstitution', string: 'Hi %1', substitutions: [' Ann '] },
    expected: { operator: 'buildString', template: 'Hi %1', substitutions: [' Ann '], trim: true },
  },
  {
    name: '`trimWhiteSpace: false` is v3’s default',
    input: {
      operator: 'stringSubstitution',
      string: '[%1]',
      substitutions: [' a '],
      trimWhiteSpace: false,
    },
    expected: { operator: 'buildString', template: '[%1]', substitutions: [' a '] },
  },
  {
    name: 'a computed `trimWhiteSpace` carries over',
    input: {
      operator: 'stringSubstitution',
      string: '[%1]',
      substitutions: [' a '],
      trim: { $and: [true] },
    },
    expected: {
      operator: 'buildString',
      template: '[%1]',
      substitutions: [' a '],
      trim: { operator: 'and', values: [true] },
    },
  },
  {
    name: 'gapped tokens are renumbered by rank',
    input: { operator: 'stringSubstitution', string: 'My %1 is %3', substitutions: ['a', 'b'] },
    expected: {
      operator: 'buildString',
      template: 'My %1 is %2',
      substitutions: ['a', 'b'],
      trim: true,
    },
  },
  {
    name: 'repeated and out-of-order tokens',
    input: {
      operator: 'stringSubstitution',
      string: '%5, %2 and %5',
      substitutions: ['a', 'b'],
    },
    expected: {
      operator: 'buildString',
      template: '%2, %1 and %2',
      substitutions: ['a', 'b'],
      trim: true,
    },
  },
  {
    name: '`$` tokens become `%` tokens',
    input: {
      operator: 'stringSubstitution',
      string: 'Hi $1, $3',
      substitutions: ['a', 'b'],
      substitutionCharacter: '$',
    },
    expected: {
      operator: 'buildString',
      template: 'Hi %1, %2',
      substitutions: ['a', 'b'],
      trim: true,
    },
  },
  {
    name: '`%` text that is not a token',
    input: { operator: 'stringSubstitution', string: '100% of %1', substitutions: [5] },
    expected: {
      operator: 'buildString',
      template: '100% of %1',
      substitutions: [5],
      trim: true,
    },
  },
  {
    name: 'an escape v3 can write as text loses its backslash',
    input: { operator: 'stringSubstitution', string: '100\\% of %1', substitutions: [5] },
    expected: {
      operator: 'buildString',
      template: '100% of %1',
      substitutions: [5],
      trim: true,
    },
  },
  {
    name: 'an escaped token has no v3 spelling',
    input: { operator: 'stringSubstitution', string: 'Hi \\%1 %1', substitutions: ['a'] },
    expected: {
      '//': `${NOTE}v3 has no escapes, and reads \`%N\` and \`{{…}}\` in a template as tokens. To show such text literally, pass it in as a substitution.`,
      operator: 'buildString',
      template: 'Hi \\%1 %1',
      substitutions: ['a'],
      trim: true,
    },
    issues: [{ code: 'template-escape', path: ['string'] }],
    differs: { v2: { value: 'Hi %1 a' }, v3: { value: 'Hi \\a a' } },
  },
  {
    name: '`%N` text in a `$` template would become a token',
    input: {
      operator: 'stringSubstitution',
      string: '$1 is 100%1',
      substitutions: ['a'],
      subChar: '$',
    },
    expected: {
      '//': `${NOTE}v3 has no escapes, and reads \`%N\` and \`{{…}}\` in a template as tokens. To show such text literally, pass it in as a substitution.`,
      operator: 'buildString',
      template: '%1 is 100%1',
      substitutions: ['a'],
      trim: true,
    },
    issues: [{ code: 'template-escape', path: ['string'] }],
    differs: { v2: { value: 'a is 100%1' }, v3: { value: 'a is 100a' } },
  },
  {
    name: 'a token with no substitution, which validate() warns about: the guide',
    input: { operator: 'stringSubstitution', string: '%1 %2', substitutions: ['a'] },
    expected: { operator: 'buildString', template: '%1 %2', substitutions: ['a'], trim: true },
    differs: { v2: { value: 'a ' }, v3: { value: 'a %2' } },
  },
  {
    name: 'a null value renders as nothing, as in 2.23.2',
    input: { operator: 'stringSubstitution', string: '[%1]', substitutions: [null] },
    expected: { operator: 'buildString', template: '[%1]', substitutions: [null], trim: true },
  },
  {
    name: '`children`',
    input: { operator: 'stringSubstitution', children: ['%1-%3', 'a', 'b'] },
    expected: {
      operator: 'buildString',
      template: '%1-%2',
      substitutions: ['a', 'b'],
      trim: true,
    },
  },
  {
    name: '`numberMapping` is ignored in positional mode, as v2 ignored it',
    input: {
      operator: 'stringSubstitution',
      string: '%1',
      substitutions: [2],
      numberMapping: { count: { other: '{} friends' } },
    },
    expected: { operator: 'buildString', template: '%1', substitutions: [2], trim: true },
  },
  {
    name: 'a computed `substitutions` with positional tokens is renumbered',
    input: {
      operator: 'stringSubstitution',
      string: '%1-%3',
      substitutions: ifNode(['a', 'b'], []),
    },
    expected: {
      operator: 'buildString',
      template: '%1-%2',
      substitutions: ifV3(['a', 'b'], []),
      trim: true,
    },
  },
  {
    name: 'a computed positional template cannot be renumbered',
    input: {
      operator: 'stringSubstitution',
      string: ifNode('%1-%2', '%2'),
      substitutions: ['a', 'b'],
    },
    expected: {
      operator: 'buildString',
      template: ifV3('%1-%2', '%2'),
      substitutions: ['a', 'b'],
      trim: true,
    },
    issues: [{ code: 'template-numbering', path: ['string'] }],
  },
  {
    name: 'a computed template in `$` mode',
    input: {
      operator: 'stringSubstitution',
      string: ifNode('$1', '$2'),
      substitutions: ['a'],
      substitutionCharacter: '$',
    },
    expected: {
      '//': `${NOTE}The template's \`$N\` tokens must become \`%N\` for v3, and a computed template cannot be rewritten. Rewrite the template with v3's tokens.`,
      operator: 'buildString',
      template: ifV3('$1', '$2'),
      substitutions: ['a'],
      trim: true,
    },
    issues: [{ code: 'computed-dollar-template', path: ['string'] }],
    differs: { v2: { value: 'a' }, v3: { value: '$1' } },
  },
  {
    name: 'a computed `substitutionCharacter`',
    input: {
      operator: 'stringSubstitution',
      string: '%1',
      substitutions: ['a'],
      substitutionCharacter: ifNode('%', '$'),
    },
    expected: {
      '//': `${NOTE}The template's \`$N\` tokens must become \`%N\` for v3, and a computed \`substitutionCharacter\` cannot be rewritten. Rewrite the template with v3's tokens.`,
      operator: 'buildString',
      template: '%1',
      substitutions: ['a'],
      trim: true,
    },
    issues: [{ code: 'computed-dollar-template', path: ['substitutionCharacter'] }],
  },

  // STRING_SUBSTITUTION, named
  {
    name: 'a named token from `substitutions`',
    input: {
      operator: 'stringSubstitution',
      string: 'Hi {{name}}',
      substitutions: { name: 'Ann' },
    },
    expected: {
      operator: 'buildString',
      template: 'Hi {{name}}',
      substitutions: { name: 'Ann' },
      trim: true,
    },
  },
  {
    name: 'a named token that read `data` is a reference token',
    input: { operator: 'stringSubstitution', string: 'Hi {{user.name}}, {{user.friends[1].name}}' },
    expected: {
      operator: 'buildString',
      template: 'Hi {{$data.user.name}}, {{$data.user.friends[1].name}}',
      trim: true,
    },
  },
  {
    name: 'a missing name renders as nothing in both',
    input: { operator: 'stringSubstitution', string: '[{{nope}}]', substitutions: {} },
    expected: {
      operator: 'buildString',
      template: '[{{$data.nope}}]',
      substitutions: {},
      trim: true,
    },
  },
  {
    name: 'names from both',
    input: {
      operator: 'stringSubstitution',
      string: '{{greeting}}, {{user.name}}',
      substitutions: { greeting: 'Hi' },
    },
    expected: {
      operator: 'buildString',
      template: '{{greeting}}, {{$data.user.name}}',
      substitutions: { greeting: 'Hi' },
      trim: true,
    },
  },
  {
    name: 'a substitution that is a node is evaluated, as v2 evaluated it',
    input: {
      operator: 'stringSubstitution',
      string: 'Hi {{n}}',
      substitutions: { n: { $plus: [1, 2] } },
    },
    expected: {
      operator: 'buildString',
      template: 'Hi {{n}}',
      substitutions: { n: { operator: 'plus', values: [1, 2] } },
      trim: true,
    },
  },
  {
    name: 'a `$` key no token could read goes into `//`',
    input: {
      operator: 'stringSubstitution',
      string: 'Hi {{a}}',
      substitutions: { a: 1, $unread: { $plus: [1, 2] } },
    },
    expected: {
      operator: 'buildString',
      template: 'Hi {{a}}',
      substitutions: { '//': { $unread: { $plus: [1, 2] } }, a: 1 },
      trim: true,
    },
  },
  {
    name: 'a token that drills into a substitution',
    input: {
      operator: 'stringSubstitution',
      string: 'Hi {{user.name}}',
      substitutions: { user: { name: 'Bo' } },
    },
    expected: {
      '//': `${NOTE}\`{{user.name}}\` drills into the substitution \`user\`, and v3's substitution tokens do not drill. Pass the drilled value as a substitution of its own.`,
      operator: 'buildString',
      template: 'Hi {{user.name}}',
      substitutions: { user: { name: 'Bo' } },
      trim: true,
    },
    issues: [{ code: 'drilled-substitution-token', path: ['string'] }],
    differs: { v2: { value: 'Hi Bo' }, v3: { value: 'Hi {{user.name}}' } },
  },
  {
    name: '`numberMapping` has no v3 counterpart',
    input: {
      operator: 'stringSubstitution',
      string: 'You have {{count}}',
      numberMapping: { count: { 1: 'one friend', other: '{} friends' } },
    },
    expected: {
      '//': `${NOTE}v3 has no \`numberMapping\`, so \`{{count}}\` renders the bare number. Choose the text in the substitution instead, with \`match\` or \`if\`.`,
      operator: 'buildString',
      template: 'You have {{$data.count}}',
      trim: true,
    },
    issues: [{ code: 'number-mapping', path: ['numberMapping', 'count'] }],
    differs: { v2: { value: 'You have 2 friends' }, v3: { value: 'You have 2' } },
  },
  {
    name: 'an escape v3 can write as text loses its backslash, in named mode',
    input: { operator: 'stringSubstitution', string: 'a \\{{ b {{n}}', substitutions: { n: 1 } },
    expected: {
      operator: 'buildString',
      template: 'a {{ b {{n}}',
      substitutions: { n: 1 },
      trim: true,
    },
  },
  {
    name: 'an escaped named token has no v3 spelling',
    input: { operator: 'stringSubstitution', string: '\\{{n}} is {{n}}', substitutions: { n: 1 } },
    expected: {
      '//': `${NOTE}v3 has no escapes, and reads \`%N\` and \`{{…}}\` in a template as tokens. To show such text literally, pass it in as a substitution.`,
      operator: 'buildString',
      template: '\\{{n}} is {{n}}',
      substitutions: { n: 1 },
      trim: true,
    },
    issues: [{ code: 'template-escape', path: ['string'] }],
    differs: { v2: { value: '{{n}} is 1' }, v3: { value: '\\1 is 1' } },
  },
  {
    name: '`substitutionCharacter` means nothing in named mode, though v2 evaluated it',
    input: {
      operator: 'stringSubstitution',
      string: '[{{a}}]',
      substitutions: { a: 1 },
      substitutionCharacter: ifNode('$', '%'),
    },
    expected: {
      operator: 'buildString',
      template: '[{{a}}]',
      substitutions: { a: 1 },
      trim: true,
    },
    issues: [{ code: 'discarded-expression', path: ['substitutionCharacter'] }],
  },
  {
    name: 'a computed named template',
    input: { operator: 'stringSubstitution', string: ifNode('{{a}}', '{{b}}'), substitutions: {} },
    expected: {
      operator: 'buildString',
      template: ifV3('{{a}}', '{{b}}'),
      substitutions: {},
      trim: true,
    },
    issues: [{ code: 'named-token-source', path: ['string'] }],
    differs: { v2: { value: '' }, v3: { value: '{{a}}' } },
  },
  {
    name: 'a computed `substitutions` with named tokens',
    input: {
      operator: 'stringSubstitution',
      string: 'Hi {{a}}',
      substitutions: ifNode({ a: 1 }, {}),
    },
    expected: {
      operator: 'buildString',
      template: 'Hi {{a}}',
      substitutions: ifV3({ a: 1 }, {}),
      trim: true,
    },
    issues: [{ code: 'named-token-source', path: ['string'] }],
  },

  // BUILD_OBJECT
  {
    name: 'BUILD_OBJECT over entries',
    input: {
      operator: 'buildObject',
      properties: [
        { key: 'a', value: 1 },
        { key: { $plus: ['b', 'c'] }, value: { $plus: [1, 2] } },
      ],
    },
    expected: {
      operator: 'buildObject',
      entries: [
        { key: 'a', value: 1 },
        {
          key: { operator: 'plus', values: ['b', 'c'] },
          value: { operator: 'plus', values: [1, 2] },
        },
      ],
    },
  },
  {
    name: 'an entry read from data is an entry',
    input: { operator: 'buildObject', properties: [{ operator: 'getData', property: 'entry' }] },
    expected: { operator: 'buildObject', entries: ['$data.entry'] },
  },
  {
    name: 'entries from aliases are entries',
    input: {
      operator: 'buildObject',
      $e: { operator: 'getData', property: 'entry' },
      properties: ['$e', { key: 'b', value: 2 }],
    },
    expected: {
      operator: 'buildObject',
      entries: ['$vars.e', { key: 'b', value: 2 }],
      vars: { e: '$data.entry' },
    },
  },
  {
    name: 'alternating keys and values are paired',
    input: { operator: 'buildObject', properties: ['a', 1, 'b', { $plus: [1, 2] }] },
    expected: {
      operator: 'buildObject',
      entries: [
        { key: 'a', value: 1 },
        { key: 'b', value: { operator: 'plus', values: [1, 2] } },
      ],
    },
  },
  {
    name: '`children` as entries',
    input: { operator: 'buildObject', children: [{ key: 'a', value: 1 }] },
    expected: { operator: 'buildObject', entries: [{ key: 'a', value: 1 }] },
  },
  {
    name: '`children` alternating',
    input: { operator: 'buildObject', children: ['a', 1, 'b', 2] },
    expected: {
      operator: 'buildObject',
      entries: [
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
      ],
    },
  },
  {
    name: 'an entry with no `value` is dropped',
    input: { operator: 'buildObject', properties: [{ key: 'a' }, { key: 'b', value: 2 }] },
    expected: { operator: 'buildObject', entries: [{ key: 'b', value: 2 }] },
    issues: [{ code: 'malformed-entry', path: ['properties', 0] }],
  },
  {
    name: 'a boolean key',
    input: { operator: 'buildObject', properties: [{ key: true, value: 1 }] },
    expected: { operator: 'buildObject', entries: [{ key: true, value: 1 }] },
  },
  {
    name: "an entry's other keys, which v2 ignored, go",
    input: { operator: 'buildObject', properties: [{ key: 'a', value: 1, note: { $plus: [1] } }] },
    expected: { operator: 'buildObject', entries: [{ key: 'a', value: 1 }] },
  },
  {
    name: 'a plain object inside an entry is data',
    input: { operator: 'buildObject', properties: [{ key: 'a', value: { b: { $plus: [1, 2] } } }] },
    expected: {
      operator: 'buildObject',
      entries: [{ key: 'a', value: { operator: 'literal', value: { b: { $plus: [1, 2] } } } }],
    },
  },
  {
    name: 'a computed `properties` carries over',
    input: { operator: 'buildObject', properties: ifNode([{ key: 'a', value: 1 }], []) },
    expected: { operator: 'buildObject', entries: ifV3([{ key: 'a', value: 1 }], []) },
  },

  // MATCH
  {
    name: 'MATCH on a string',
    input: { operator: 'match', matchExpression: 'b', branches: { a: 1, b: 2 } },
    expected: { operator: 'match', value: 'b', branches: { a: 1, b: 2 } },
  },
  {
    name: 'MATCH on a number',
    input: { operator: 'match', matchValue: 2, cases: { 1: 'one', 2: 'two' } },
    expected: { operator: 'match', value: 2, branches: { 1: 'one', 2: 'two' } },
  },
  {
    name: 'MATCH on a boolean',
    input: { operator: 'match', matchExpression: true, branches: { true: 'yes', false: 'no' } },
    expected: { operator: 'match', value: true, branches: { true: 'yes', false: 'no' } },
  },
  {
    name: 'a `fallback` branch is the default',
    input: { operator: 'match', matchExpression: 'z', branches: { a: 1, fallback: 'none' } },
    expected: { operator: 'match', value: 'z', branches: { a: 1 }, default: 'none' },
  },
  {
    name: 'branches on the node',
    input: { operator: 'match', matchExpression: 'b', a: 1, b: { $plus: [1, 1] } },
    expected: {
      operator: 'match',
      value: 'b',
      branches: { a: 1, b: { operator: 'plus', values: [1, 1] } },
    },
  },
  {
    name: 'a branch in `branches` beats the same one on the node',
    input: { operator: 'match', matchExpression: 'a', branches: { a: 1 }, a: 9 },
    expected: { operator: 'match', value: 'a', branches: { a: 1 } },
    issues: [{ code: 'overridden-value', path: ['a'] }],
  },
  {
    name: 'a `fallback` branch made the node’s branches unreachable',
    input: { operator: 'match', matchExpression: 'b', branches: { a: 1, fallback: 'f' }, b: 2 },
    expected: { operator: 'match', value: 'b', branches: { a: 1 }, default: 'f' },
    issues: [{ code: 'unreachable-branches', path: ['b'] }],
  },
  {
    name: 'an array of branches',
    input: { operator: 'match', matchExpression: 'b', branches: ['a', 1, 'b', { $plus: [1, 1] }] },
    expected: {
      operator: 'match',
      value: 'b',
      branches: { a: 1, b: { operator: 'plus', values: [1, 1] } },
    },
  },
  {
    name: 'a branch that is a plain object holding a node is data',
    input: { operator: 'match', matchExpression: 'a', branches: { a: { b: { $plus: [1, 2] } } } },
    expected: {
      operator: 'match',
      value: 'a',
      branches: { a: { operator: 'literal', value: { b: { $plus: [1, 2] } } } },
    },
  },
  {
    name: 'a branch key is data, `$` and all',
    input: { operator: 'match', matchExpression: '$getData', branches: { $getData: 'x', a: 'A' } },
    expected: { operator: 'match', value: '$getData', branches: { $getData: 'x', a: 'A' } },
  },
  {
    name: 'no branches',
    input: { operator: 'match', matchExpression: 'x', fallback: 'none' },
    expected: { operator: 'match', value: 'x', branches: {}, fallback: 'none' },
  },
  {
    name: 'a computed `branches`',
    input: {
      operator: 'match',
      matchExpression: 'a',
      branches: { operator: 'buildObject', properties: [{ key: 'a', value: 1 }] },
    },
    expected: {
      operator: 'match',
      value: 'a',
      branches: { operator: 'buildObject', entries: [{ key: 'a', value: 1 }] },
    },
    issues: [{ code: 'computed-branches', path: ['branches'] }],
  },
  {
    name: "a computed `branches`, with the node's own branches as the default",
    input: {
      operator: 'match',
      matchExpression: { $getData: 'key' },
      branches: { operator: 'buildObject', properties: [{ key: 'a', value: 1 }] },
      b: 2,
    },
    expected: {
      operator: 'match',
      value: '$data.key',
      branches: { operator: 'buildObject', entries: [{ key: 'a', value: 1 }] },
      default: { operator: 'match', value: '$data.key', branches: { b: 2 } },
    },
    issues: [{ code: 'computed-branches', path: ['branches'] }],
  },
  {
    name: 'a computed value to match is bound once for both',
    input: {
      operator: 'match',
      matchExpression: { $plus: ['', 'b'] },
      branches: { operator: 'buildObject', properties: [{ key: 'a', value: 1 }] },
      b: 2,
    },
    expected: {
      operator: 'match',
      value: '$vars.value',
      branches: { operator: 'buildObject', entries: [{ key: 'a', value: 1 }] },
      default: { operator: 'match', value: '$vars.value', branches: { b: 2 } },
      vars: { value: { operator: 'plus', values: ['', 'b'] } },
    },
    issues: [{ code: 'computed-branches', path: ['branches'] }],
  },

  // PASSTHRU
  {
    name: 'PASSTHRU over a node is the node',
    input: { operator: 'pass', value: { $plus: [1, 2] } },
    expected: { operator: 'plus', values: [1, 2] },
  },
  {
    name: 'PASSTHRU over a constant',
    input: { operator: 'passThru', _: 5 },
    expected: 5,
  },
  {
    name: 'PASSTHRU over several children is the array',
    input: { operator: 'pass', children: [1, { $plus: [1, 1] }] },
    expected: [1, { operator: 'plus', values: [1, 1] }],
  },
  {
    name: 'PASSTHRU over a plain object holding a node, which is data',
    input: { operator: 'pass', value: { a: { operator: 'and', values: [] } } },
    expected: { operator: 'literal', value: { a: { operator: 'and', values: [] } } },
  },
]

describe('batch 3', () => {
  test.each(BATCH_3)('$name', (example) => check({ data: DATA, ...example }))

  test('an alternating list of odd length is one v2 failed on, and the message says so', () => {
    const { expression, issues } = convertV2({
      operator: 'buildObject',
      properties: ['a', 1, 'b'],
    })
    expect(expression).toEqual({ operator: 'buildObject', entries: [{ key: 'a', value: 1 }] })
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'malformed-entry',
        path: ['properties', 2],
        message: expect.stringContaining('v2 failed on'),
      }),
    ])
  })
})

interface IoExample extends Example {
  /** What the HTTP client answers every request with */
  response?: unknown
  /** What the SQL connection answers every query with */
  rows?: Record<string, unknown>[]
  v2Options?: Record<string, unknown>
  v3Options?: ConstructorParameters<typeof FigTree>[0]
}

/**
 * Batch 4 runs against one response on both sides, and holds the request
 * each engine sent to the other's, as well as the result
 */
const ioCheck = async (example: IoExample) => {
  const { response = null, rows = [], v2Options = {}, v3Options = {} } = example
  const http = new MockHttpClient({ defaultResponse: response })
  const sql = new MockSqlConnection({ defaultRows: rows })
  const fig = new FigTree({
    ...v3Options,
    operators: [coreOperators, httpOperators(http), sqlOperators(sql)],
  })
  const sentV2: SentRequest[] = []
  const queriesV2: SentQuery[] = []
  await check(example, fig, {
    ...v2Options,
    httpClient: v2HttpClient(response, sentV2),
    sqlConnection: v2SqlConnection(rows, queriesV2),
  })
  const sentV3 = http.calls.map(({ method, url, headers, body }) =>
    sentRequest(method, url, undefined, headers, body)
  )
  expect(sentV3).toEqual(sentV2)
  expect(sql.calls.map(({ text, values }) => ({ text, values: values ?? [] }))).toEqual(queriesV2)
}

const COLLAPSE: Raised = { code: 'response-collapse', path: [] }
const USERS = [{ name: 'x' }, { name: 'y' }]
const MULTI = { a: 1, b: 2 }

const BATCH_4: IoExample[] = [
  // GET, POST
  {
    name: 'GET, whose response v2 collapsed',
    input: { operator: 'GET', url: 'https://x.test/users' },
    response: USERS,
    expected: { operator: 'http', url: 'https://x.test/users' },
    issues: [COLLAPSE],
    differs: { v2: { value: ['x', 'y'] }, v3: { value: USERS } },
  },
  {
    name: 'GET over objects with several keys, which v2 left alone',
    input: { operator: 'api', endpoint: 'https://x.test/users' },
    response: [MULTI, MULTI],
    expected: { operator: 'http', url: 'https://x.test/users' },
    issues: [COLLAPSE],
  },
  {
    name: 'query parameters, their values evaluated and their `$` keys vars',
    input: {
      operator: 'get',
      url: 'https://x.test/users',
      parameters: { q: { $plus: [1, 2] }, $n: 5, m: '$n' },
    },
    response: MULTI,
    expected: {
      operator: 'http',
      url: 'https://x.test/users',
      query: { q: { operator: 'plus', values: [1, 2] }, m: '$vars.n', vars: { n: 5 } },
    },
    issues: [COLLAPSE],
  },
  {
    name: 'a plain object inside a query value is data',
    input: { operator: 'GET', url: 'https://x.test', parameters: { q: '$data.x' } },
    response: MULTI,
    expected: {
      operator: 'http',
      url: 'https://x.test',
      query: { q: { operator: 'literal', value: '$data.x' } },
    },
    issues: [COLLAPSE],
  },
  {
    name: 'headers, their values evaluated',
    input: { operator: 'GET', url: 'https://x.test', headers: { h: { $plus: ['a', 'b'] } } },
    response: MULTI,
    expected: {
      operator: 'http',
      url: 'https://x.test',
      headers: { h: { operator: 'plus', values: ['a', 'b'] } },
    },
    issues: [COLLAPSE],
  },
  {
    name: 'a relative URL joins the base endpoint',
    input: { operator: 'GET', url: 'users', returnProperty: 'data' },
    v2Options: { baseEndpoint: 'https://x.test' },
    v3Options: { http: { baseEndpoint: 'https://x.test' } },
    response: { data: MULTI },
    expected: { operator: 'http', url: 'users', returnPath: 'data' },
    issues: [COLLAPSE],
  },
  {
    name: 'a return property holding one key, which v2 collapsed',
    input: { operator: 'GET', url: 'https://x.test', outputProperty: 'a' },
    response: { a: { only: 5 } },
    expected: { operator: 'http', url: 'https://x.test', returnPath: 'a' },
    issues: [COLLAPSE],
    differs: { v2: { value: 5 }, v3: { value: { only: 5 } } },
  },
  {
    name: 'a missing return property, which v2 failed on',
    input: { operator: 'GET', url: 'https://x.test', returnProperty: 'zz' },
    response: MULTI,
    expected: { operator: 'http', url: 'https://x.test', returnPath: 'zz' },
    issues: [COLLAPSE],
    differs: { v2: { error: true }, v3: { value: null } },
  },
  {
    name: "a `url` object is split, its headers beneath the node's",
    input: {
      operator: 'GET',
      url: { url: 'https://x.test', headers: { u: '1', h: '1' } },
      headers: { h: '2' },
    },
    response: MULTI,
    expected: { operator: 'http', url: 'https://x.test', headers: { u: '1', h: '2' } },
    issues: [COLLAPSE],
  },
  {
    name: "beside computed headers, a `url` object's merge with `plus`",
    input: {
      operator: 'GET',
      url: { url: 'https://x.test', headers: { u: '1' } },
      headers: { $plus: [{ h: '2' }, {}] },
    },
    response: MULTI,
    expected: {
      operator: 'http',
      url: 'https://x.test',
      headers: {
        operator: 'plus',
        values: [{ u: '1' }, { operator: 'plus', values: [{ h: '2' }, {}] }],
      },
    },
    issues: [COLLAPSE],
  },
  {
    name: 'POST with a body, uncached as in v2',
    input: { operator: 'POST', url: 'https://x.test', parameters: { a: { $plus: [1, 2] } } },
    response: MULTI,
    expected: {
      operator: 'http',
      url: 'https://x.test',
      method: 'post',
      body: { a: { operator: 'plus', values: [1, 2] } },
      useCache: false,
    },
    issues: [COLLAPSE],
  },
  {
    name: 'POST with no body sends an empty one, as v2 did',
    input: { operator: 'post', url: 'https://x.test' },
    response: MULTI,
    expected: {
      operator: 'http',
      url: 'https://x.test',
      method: 'post',
      body: {},
      useCache: false,
    },
    issues: [COLLAPSE],
  },
  {
    name: "POST's own `useCache` stands",
    input: { operator: 'POST', url: 'https://x.test', useCache: true },
    response: MULTI,
    expected: { operator: 'http', url: 'https://x.test', method: 'post', body: {}, useCache: true },
    issues: [COLLAPSE],
  },
  {
    name: "POST caches where v2's `useCache` option said so",
    input: { operator: 'POST', url: 'https://x.test' },
    options: { useCache: true },
    response: MULTI,
    expected: { operator: 'http', url: 'https://x.test', method: 'post', body: {} },
    issues: [COLLAPSE],
  },
  {
    name: 'a computed `useCache` on GET is a deciding value',
    input: { operator: 'GET', url: 'https://x.test', useCache: { $and: [true] } },
    response: MULTI,
    expected: {
      '//': decidingNote('`useCache` is computed', '`useCache: true`', 'useCache'),
      operator: 'http',
      url: 'https://x.test',
      useCache: true,
    },
    issues: [COLLAPSE, { code: 'deciding-value', path: ['useCache'] }],
  },
  {
    name: '`children`',
    input: { operator: 'GET', children: ['https://x.test', ['q'], 1, 'a'] },
    response: { a: MULTI },
    expected: { operator: 'http', url: 'https://x.test', query: { q: 1 }, returnPath: 'a' },
    issues: [COLLAPSE],
  },

  // GRAPHQL, a computed URL
  {
    name: 'GRAPHQL with a computed URL, which is no relative URL',
    input: {
      operator: 'graphQL',
      url: { operator: 'getData', property: 'endpoint' },
      query: 'query { a }',
    },
    data: { endpoint: 'https://g.test/graphql' },
    response: { data: { a: 1 } },
    expected: { operator: 'graphQL', query: 'query { a }', url: '$data.endpoint' },
    issues: [COLLAPSE],
  },
  // GRAPHQL
  {
    name: 'GRAPHQL with a full URL, whose response v2 collapsed',
    input: {
      operator: 'graphQL',
      url: 'https://g.test/graphql',
      query: 'query { countries { name } }',
      returnNode: 'countries',
    },
    response: { data: { countries: [{ name: 'NZ' }, { name: 'AU' }] } },
    expected: {
      operator: 'graphQL',
      query: 'query { countries { name } }',
      url: 'https://g.test/graphql',
      returnPath: 'countries',
    },
    issues: [COLLAPSE],
    differs: {
      v2: { value: ['NZ', 'AU'] },
      v3: { value: [{ name: 'NZ' }, { name: 'AU' }] },
    },
  },
  {
    name: "v2's placeholder URL is the configured endpoint",
    input: { operator: 'graphQL', url: 'GraphQLEndpoint', query: 'q' },
    v2Options: { graphQLConnection: { endpoint: 'https://g.test' } },
    v3Options: { graphQL: { endpoint: 'https://g.test' } },
    response: { data: MULTI },
    expected: { operator: 'graphQL', query: 'q' },
    issues: [COLLAPSE],
  },
  {
    name: 'no URL, and variables evaluated',
    input: { operator: 'gql', query: 'q', variables: { v: { $plus: [1, 2] } } },
    v2Options: { graphQLConnection: { endpoint: 'https://g.test' } },
    v3Options: { graphQL: { endpoint: 'https://g.test' } },
    response: { data: MULTI },
    expected: {
      operator: 'graphQL',
      query: 'q',
      variables: { v: { operator: 'plus', values: [1, 2] } },
    },
    issues: [COLLAPSE],
  },
  {
    name: 'a relative URL, which v3 joins to another option',
    input: { operator: 'graphQL', url: 'v2/graphql', query: 'q' },
    v2Options: { graphQLConnection: { endpoint: 'https://g.test' } },
    v3Options: { http: { baseEndpoint: 'https://g.test' } },
    response: { data: MULTI },
    expected: { operator: 'graphQL', query: 'q', url: 'v2/graphql' },
    issues: [{ code: 'graphql-relative-url', path: ['url'] }, COLLAPSE],
  },
  {
    name: 'a response carrying errors, which v3 fails: the guide',
    input: { operator: 'graphQL', url: 'https://g.test', query: 'q' },
    response: { data: MULTI, errors: [{ message: 'partial' }] },
    expected: { operator: 'graphQL', query: 'q', url: 'https://g.test' },
    issues: [COLLAPSE],
    differs: { v2: { value: MULTI }, v3: { error: true } },
  },

  // SQL
  {
    name: 'SQL as rows',
    input: { operator: 'sql', query: 'SELECT a FROM t' },
    rows: [{ a: 1 }, { a: 2 }],
    expected: { operator: 'sql', query: 'SELECT a FROM t' },
  },
  {
    name: 'bind values',
    input: { operator: 'pg', text: 'SELECT a FROM t WHERE b = $1', replacements: [5] },
    rows: [{ a: 1 }],
    expected: { operator: 'sql', query: 'SELECT a FROM t WHERE b = $1', values: [5] },
  },
  {
    name: '`single` is the first row',
    input: { operator: 'sql', query: 'SELECT a FROM t', single: true },
    rows: [{ a: 1 }, { a: 2 }],
    expected: { operator: 'sql', query: 'SELECT a FROM t', shape: 'firstRow' },
  },
  {
    name: '`single` with no rows',
    input: { operator: 'sql', query: 'SELECT a FROM t', single: true },
    rows: [],
    expected: { operator: 'sql', query: 'SELECT a FROM t', shape: 'firstRow' },
  },
  {
    name: '`flatten` over one column',
    input: { operator: 'sql', query: 'SELECT a FROM t', flatten: true },
    rows: [{ a: 1 }, { a: 2 }],
    expected: { operator: 'sql', query: 'SELECT a FROM t', shape: 'column' },
  },
  {
    name: '`single` and `flatten`',
    input: { operator: 'sql', query: 'SELECT a FROM t', single: true, flat: true },
    rows: [{ a: 1 }, { a: 2 }],
    expected: { operator: 'sql', query: 'SELECT a FROM t', shape: 'firstValue' },
  },
  {
    name: '`flatten` over two columns, which v3 rejects: the guide',
    input: { operator: 'sql', query: 'SELECT a, b FROM t', flatten: true },
    rows: [{ a: 1, b: 2 }],
    expected: { operator: 'sql', query: 'SELECT a, b FROM t', shape: 'column' },
    differs: { v2: { value: [[1, 2]] }, v3: { error: true } },
  },
  {
    name: 'the `type` rider',
    input: { operator: 'sql', query: 'SELECT a FROM t', type: 'array' },
    rows: [{ a: 1 }, { a: 2 }],
    expected: {
      operator: 'convert',
      value: { operator: 'sql', query: 'SELECT a FROM t', shape: 'column' },
      to: 'array',
    },
    issues: [{ code: 'output-type', path: ['type'] }],
  },
  {
    name: 'a computed `single` is a deciding value',
    input: { operator: 'sql', query: 'SELECT a FROM t', single: { $and: [true] } },
    rows: [{ a: 1 }],
    expected: {
      '//': decidingNote('`single` is computed', "`shape: 'rows'`", 'single'),
      operator: 'sql',
      query: 'SELECT a FROM t',
    },
    issues: [{ code: 'deciding-value', path: ['single'] }],
    differs: { v2: { value: { a: 1 } }, v3: { value: [{ a: 1 }] } },
  },
  {
    name: 'a computed `type` is a deciding value, and converts nothing',
    input: { operator: 'sql', query: 'SELECT a FROM t', type: ifNode('array', 'string') },
    rows: [{ a: 1 }],
    expected: {
      '//': decidingNote('`type` is computed', "`shape: 'rows'`", 'type'),
      operator: 'sql',
      query: 'SELECT a FROM t',
    },
    issues: [{ code: 'deciding-value', path: ['type'] }],
    differs: { v2: { value: [1] }, v3: { value: [{ a: 1 }] } },
  },
  {
    name: 'a computed `type` beside `flatten: true` decides nothing',
    input: {
      operator: 'sql',
      query: 'SELECT a FROM t',
      flatten: true,
      type: ifNode('array', 'string'),
    },
    rows: [{ a: 1 }],
    expected: { operator: 'sql', query: 'SELECT a FROM t', shape: 'column' },
  },
]

describe('batch 4', () => {
  test.each(BATCH_4)('$name', (example) => ioCheck(example))

  // v2 never evaluated them, so a node inside is data. A header value must be
  // text in v3, so this one fails there, as it sent an object in v2.
  test("GRAPHQL's headers are data", () => {
    const headers = { h: { $plus: ['a', 'b'] } }
    const { expression } = convertV2({ operator: 'graphQL', query: 'q', headers })
    expect(expression).toEqual({
      operator: 'graphQL',
      query: 'q',
      headers: { operator: 'literal', value: headers },
    })
  })
})

const FUNCTIONS = {
  fullName: (first: string, last: string) => `${first} ${last}`,
  record: (...args: unknown[]) => args,
}

/** A v2 function as a v3 operator, the recipe's way, with `input` as well */
const asOperator = (name: string, fn: (...args: never[]) => unknown) =>
  defineOperator({
    name,
    category: 'other',
    description: `The v2 function ${name}`,
    parameters: {
      input: { type: 'any', required: false },
      args: { type: 'array', default: [] },
    },
    positionalParams: ['...args'],
    evaluate: ({ input, args }) =>
      (fn as (...args: unknown[]) => unknown)(
        ...(input === undefined ? [] : [input]),
        ...(args as unknown[])
      ),
  })

const v3Functions = new FigTree({
  operators: [
    coreOperators,
    ...Object.entries(FUNCTIONS).map(([name, fn]) => asOperator(name, fn)),
  ],
})

const callNote = (name: string) =>
  `${NOTE}A call on the v2 custom function \`${name}\`. Register a v3 operator of that name, as "Custom functions" in the migration guide suggests, and check this call against its parameters.`
const CALL: Raised = { code: 'custom-function-call', path: [] }

const BATCH_5: Example[] = [
  {
    name: 'the explicit form, with `args`',
    input: { operator: 'customFunctions', functionName: 'fullName', args: ['Ann', 'Lee'] },
    expected: { '//': callNote('fullName'), $fullName: ['Ann', 'Lee'] },
    issues: [CALL],
  },
  {
    name: '`children`',
    input: { operator: 'functions', children: ['fullName', 'Ann', 'Lee'] },
    expected: { '//': callNote('fullName'), $fullName: ['Ann', 'Lee'] },
    issues: [CALL],
  },
  {
    name: 'an `operator` naming the function',
    input: { operator: 'fullName', args: ['Ann', 'Lee'] },
    expected: { '//': callNote('fullName'), $fullName: ['Ann', 'Lee'] },
    issues: [CALL],
  },
  {
    name: 'shorthand over an array',
    input: { $fullName: [{ $getData: 'first' }, 'Lee'] },
    data: { first: 'Ann' },
    expected: { '//': callNote('fullName'), $fullName: ['$data.first', 'Lee'] },
    issues: [CALL],
  },
  {
    name: 'shorthand over one value',
    input: { $record: 5 },
    expected: { '//': callNote('record'), $record: [5] },
    issues: [CALL],
  },
  {
    name: 'a computed `args` is the whole payload',
    input: { operator: 'customFunctions', functionName: 'record', args: ifNode([1, 2], []) },
    expected: { '//': callNote('record'), $record: ifV3([1, 2], []) },
    issues: [CALL],
  },
  {
    name: 'no arguments',
    input: { operator: 'customFunctions', functionName: 'record' },
    expected: { '//': callNote('record'), $record: [] },
    issues: [CALL],
  },
  {
    name: '`input`, its values evaluated',
    input: { operator: 'customFunctions', name: 'record', input: { a: { $plus: [1, 2] } } },
    expected: {
      '//': callNote('record'),
      operator: 'record',
      input: { a: { operator: 'plus', values: [1, 2] } },
    },
    issues: [CALL],
  },
  {
    name: "`input`'s `$` keys are its vars",
    input: { operator: 'customFunctions', functionName: 'record', input: { $n: 5, a: '$n' } },
    expected: {
      '//': callNote('record'),
      operator: 'record',
      input: { a: '$vars.n', vars: { n: 5 } },
    },
    issues: [CALL],
  },
  {
    name: '`input` with `args`',
    input: { operator: 'customFunctions', functionName: 'record', input: { a: 1 }, args: [2] },
    expected: { '//': callNote('record'), operator: 'record', input: { a: 1 }, args: [2] },
    issues: [CALL],
  },
  {
    name: 'a shorthand object is `input`',
    input: { $record: { a: 1 } },
    expected: { '//': callNote('record'), operator: 'record', input: { a: 1 } },
    issues: [CALL],
  },
  {
    name: 'undeclared keys are gathered into `input`',
    input: { operator: 'record', a: 1, b: { $plus: [1, 1] } },
    expected: {
      '//': callNote('record'),
      operator: 'record',
      input: { a: 1, b: { operator: 'plus', values: [1, 1] } },
    },
    issues: [CALL],
  },
  {
    name: 'the modifiers stay beside the call',
    input: { $record: [1], fallback: 0, useCache: true },
    expected: { '//': callNote('record'), $record: [1], fallback: 0, useCache: true },
    issues: [CALL],
  },
  {
    name: 'and so do its vars',
    input: { operator: 'customFunctions', functionName: 'record', args: ['$n'], $n: 1 },
    expected: { '//': callNote('record'), $record: ['$vars.n'], vars: { n: 1 } },
    issues: [CALL],
  },
  {
    name: 'a computed `useCache` is a deciding value, uncached as in v2',
    input: { $record: [1], useCache: { $and: [true] } },
    expected: {
      '//': [
        callNote('record'),
        decidingNote('`useCache` is computed', '`useCache: false`', 'useCache'),
      ],
      $record: [1],
      useCache: false,
    },
    issues: [CALL, { code: 'deciding-value', path: ['useCache'] }],
  },
]

describe('batch 5', () => {
  test.each(BATCH_5)('$name', (example) =>
    check(
      { ...example, options: { functions: Object.keys(FUNCTIONS), ...example.options } },
      v3Functions,
      { functions: FUNCTIONS }
    )
  )

  test('a computed `functionName` is quoted as written', async () => {
    const input = {
      operator: 'customFunctions',
      functionName: { $plus: ['full', 'Name'] },
      args: ['Ann', 'Lee'],
    }
    await check(
      {
        name: '',
        input,
        expected: {
          '//':
            `${NOTE}The function name is computed, and v3 operator names are literal. The call ` +
            'is quoted unconverted. Rewrite it by hand, for example as a `match` over the ' +
            'functions it can name.',
          operator: 'literal',
          value: input,
        },
        issues: [{ code: 'computed-function-name', path: ['functionName'] }],
        differs: { v2: { value: 'Ann Lee' }, v3: { value: input } },
      },
      v3Functions,
      { functions: FUNCTIONS }
    )
  })

  test.each([
    ['utils.format', '`utils.format` holds a `.`, which a v3 name cannot'],
    ['round', "`round` is already a v3 operator's name"],
  ])('a function named %s must be registered under another name', (name, reason) => {
    const { expression, issues } = convertV2({
      operator: 'customFunctions',
      functionName: name,
      args: [1],
    })
    expect(expression).toEqual({ '//': issues[0].message.replace(/^/, NOTE), [`$${name}`]: [1] })
    expect(issues[0].message).toBe(
      `${callNote(name).slice(NOTE.length)} ${reason}, so register it under another name and rename the call.`
    )
  })
})
