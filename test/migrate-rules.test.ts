/**
 * Phase 15.1 — the v2→v3 rules ("The v2→v3 rules" in
 * docs-dev/v3-specs/v3-converter.md).
 *
 * The checks hold every rule to both tables: each v2 parameter has a fate,
 * and each target is a v3 operator and parameter. Each example converts to
 * the output the spec gives, validates in v3, and evaluates the same in the
 * published v2 package and in v3, or differs as its row says.
 *
 * TO-DO: batches 2 to 5 (chunk 5), when every operator has a rule.
 */
import { FigTree, coreOperators, httpOperators, sqlOperators } from '../src'
import type { V2Options } from '../src/migrationTypes'
import { convertV2 } from '../src/migrate/convert'
import type { IssueCode, Path } from '../src/migrate/issues'
import { V3_RULES } from '../src/migrate/rules'
import { V2_PARAMETERS, type V2Operator } from '../src/migrate/v2/operators.generated'
import { MockHttpClient, MockSqlConnection } from './helpers'
import {
  clone,
  deepFreeze,
  v2Outcome,
  v3Errors,
  v3Outcome,
  type Outcome,
} from './helpers/migration'

const v3 = new FigTree({
  operators: [
    coreOperators,
    httpOperators(new MockHttpClient()),
    sqlOperators(new MockSqlConnection()),
  ],
})

describe('the checks', () => {
  const rules = Object.entries(V3_RULES) as [
    V2Operator,
    NonNullable<(typeof V3_RULES)[V2Operator]>,
  ][]

  test('the rules built so far are batch 1', () => {
    expect(rules.map(([operator]) => operator).sort()).toEqual(
      [
        'AND',
        'OR',
        'MULTIPLY',
        'EQUAL',
        'NOT_EQUAL',
        'GREATER_THAN',
        'LESS_THAN',
        'CONDITIONAL',
        'REGEX',
        'COUNT',
        'SPLIT',
      ].sort()
    )
  })

  test.each(rules)('%s gives every v2 parameter a fate', (operator, rule) => {
    const declared = V2_PARAMETERS[operator]
      .map(({ name }) => name)
      .filter((name) => name !== 'useCache')
    expect(Object.keys(rule.params).sort()).toEqual(declared.sort())
  })

  test.each(rules)("%s's targets are v3 operators and parameters", (_, rule) => {
    const target = v3.getOperators().find(({ name }) => name === rule.to)
    expect(target).toBeDefined()
    const parameters = Object.keys(target!.parameters)
    for (const fate of Object.values(rule.params)) {
      const name = typeof fate === 'object' ? fate.to : fate
      if (name !== 'consumed' && name !== 'omitted') expect(parameters).toContain(name)
    }
    for (const name of Object.keys(rule.add ?? {})) expect(parameters).toContain(name)
  })
})

interface Example {
  name: string
  input: unknown
  options?: V2Options
  data?: Record<string, unknown>
  expected: unknown
  issues?: { code: IssueCode; path: Path }[]
  /** Where the engines differ, each one's outcome */
  differs?: { v2: Outcome; v3: Outcome }
  /** A difference `validate()` reports, which goes to the guide */
  invalid?: true
}

const NOTE = 'v2 conversion: '
const decidingNote = (reason: string, wrote: string) =>
  `${NOTE}${reason}, so the converter cannot tell what v2 did. It wrote ${wrote}, v2's ` +
  'default. Where `strict` can be otherwise, rewrite the node by hand.'

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

describe('batch 1', () => {
  test.each(BATCH_1)('$name', async (example) => {
    const { input, options = {}, data, expected, issues = [], differs, invalid } = example
    const { expression, issues: raised } = convertV2(deepFreeze(clone(input)), options)

    expect(expression).toEqual(expected)
    expect(raised.map(({ code, path }) => ({ code, path }))).toEqual(issues)
    if (!invalid) expect(v3Errors(v3, expression, data)).toEqual([])

    const v2 = await v2Outcome(input, { ...options, data })
    const converted = await v3Outcome(v3, expression, data)
    if (differs) expect({ v2, v3: converted }).toEqual(differs)
    else expect(converted).toEqual(v2)
  })
})
