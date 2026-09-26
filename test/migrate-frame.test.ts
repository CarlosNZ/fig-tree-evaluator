/**
 * Phase 15.1 — what surrounds the rules ("Rules that cut across operators"
 * and "Placeholders" in docs-dev/v3-specs/v3-converter.md): the modifiers,
 * aliases → `vars`, the `literal` wrap, keys v2 ignored, placeholders and
 * their notes, and source paths. Tested through batch 1, whose rules are
 * renames, so what each example shows is the frame.
 *
 * Each converts to the output given, validates in v3, and evaluates the same
 * in the published v2 package and in v3, or differs as its row says. The
 * objects an operator evaluated itself are tested with their operators, in
 * migrate-rules.
 */
import { FigTree, coreOperators, httpOperators } from '../src'
import type { V2Options } from '../src/migrationTypes'
import { convertV2 } from '../src/migrate/convert'
import type { IssueCode, Path } from '../src/migrate/issues'
import { MockHttpClient } from './helpers'
import {
  clone,
  deepFreeze,
  v2HttpClient,
  v2Outcome,
  v3Errors,
  v3Outcome,
  type Outcome,
} from './helpers/migration'

const v3 = new FigTree()

const convert = (input: unknown, options: V2Options = {}) =>
  convertV2(deepFreeze(clone(input)), options)

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
}

const NOTE = 'v2 conversion: '
const decidingNote = (reason: string, wrote: string) =>
  `${NOTE}${reason}, so the converter cannot tell what v2 did. It wrote ${wrote}, v2's ` +
  'default. Where `strict` can be otherwise, rewrite the node by hand.'
const unknownNote = (name: string) =>
  `${NOTE}\`${name}\` is not a v2 operator. If it is one of your v2 custom functions, ` +
  "list it in the conversion's `functions` option and convert again, so the call converts to a call on a custom operator of that name. The node is quoted unconverted."

const check = async (
  { input, options = {}, data, expected, issues = [], differs }: Example,
  fig = v3,
  v2Options: object = {}
) => {
  const { expression, issues: raised } = convert(input, options)
  expect(expression).toEqual(expected)
  expect(raised.map(({ code, path }) => ({ code, path }))).toEqual(issues)
  expect(v3Errors(fig, expression, data)).toEqual([])
  const v2 = await v2Outcome(input, { ...options, ...v2Options, data })
  const converted = await v3Outcome(fig, expression, data)
  if (differs) expect({ v2, v3: converted }).toEqual(differs)
  else expect(converted).toEqual(v2)
}

describe('the modifiers', () => {
  const EXAMPLES: Example[] = [
    {
      name: '`fallback` is converted and carried',
      input: { operator: '=', values: [1, 1], fallback: { $and: [true] } },
      expected: {
        operator: 'equal',
        values: [1, 1],
        fallback: { operator: 'and', values: [true] },
      },
    },
    {
      name: '`useCache` carries over',
      input: { operator: 'and', values: [true], useCache: false },
      expected: { operator: 'and', values: [true], useCache: false },
    },
    {
      name: 'a computed `useCache` where v2 never cached was ignored, and goes',
      input: { operator: 'and', values: [true], useCache: { $and: [true] } },
      expected: { operator: 'and', values: [true] },
    },
    {
      name: '`outputType` wraps the node in `convert`',
      input: { operator: 'count', values: [1, 2], outputType: 'string' },
      expected: {
        operator: 'convert',
        value: { operator: 'length', value: [1, 2] },
        to: 'string',
      },
      issues: [{ code: 'output-type', path: ['outputType'] }],
    },
    {
      name: "`type` is `outputType`, and `'bool'` is `'boolean'`",
      input: { operator: 'count', values: [1], type: 'bool' },
      expected: { operator: 'convert', value: { operator: 'length', value: [1] }, to: 'boolean' },
      issues: [{ code: 'output-type', path: ['type'] }],
    },
    // v2 read `outputType ?? type`, and converted nothing for a falsy one
    {
      name: 'a null `outputType` converts nothing',
      input: { operator: '+', values: [1, 2], outputType: null },
      expected: { operator: 'plus', values: [1, 2] },
    },
    {
      name: 'a false `outputType` converts nothing',
      input: { operator: '+', values: [1, 2], outputType: false },
      expected: { operator: 'plus', values: [1, 2] },
    },
    {
      name: 'a null `outputType` gives way to `type`',
      input: { operator: 'count', values: [1, 2], outputType: null, type: 'string' },
      expected: {
        operator: 'convert',
        value: { operator: 'length', value: [1, 2] },
        to: 'string',
      },
      issues: [{ code: 'output-type', path: ['type'] }],
    },
    {
      name: 'an empty `outputType` beats `type`, and converts nothing',
      input: { operator: 'count', values: [1, 2], outputType: '', type: 'string' },
      expected: { operator: 'length', value: [1, 2] },
      issues: [{ code: 'overridden-value', path: ['type'] }],
    },
    {
      name: "a null `outputType` gives way to PLUS's `type`",
      input: { operator: '+', values: ['5', '6'], outputType: null, type: 'number' },
      expected: {
        operator: 'convert',
        value: { operator: 'plus', values: ['5', '6'] },
        to: 'number',
      },
      issues: [{ code: 'output-type', path: ['type'] }],
    },
    {
      name: 'a computed `outputType` is a computed `to`',
      input: {
        operator: 'count',
        values: [1, 2],
        outputType: {
          operator: '?',
          condition: true,
          valueIfTrue: 'string',
          valueIfFalse: 'array',
        },
      },
      expected: {
        operator: 'convert',
        value: { operator: 'length', value: [1, 2] },
        to: { operator: 'if', condition: true, then: 'string', else: 'array' },
      },
      issues: [{ code: 'output-type', path: ['outputType'] }],
    },
    {
      name: '`fallback` and `vars` go on the wrapper, `useCache` stays on the node',
      input: {
        operator: 'count',
        values: ['$a', 2],
        $a: 1,
        useCache: true,
        fallback: '$a',
        outputType: 'number',
      },
      expected: {
        operator: 'convert',
        value: { operator: 'length', value: ['$vars.a', 2], useCache: true },
        to: 'number',
        fallback: '$vars.a',
        vars: { a: 1 },
      },
      issues: [{ code: 'output-type', path: ['outputType'] }],
    },
  ]
  test.each(EXAMPLES)('$name', (example) => check(example))

  test.each([
    ['number', "`'abc4.5x'` was `4.5`"],
    ['string', "`[1, 2]` was `'1,2'`"],
    ['boolean', "`'false'` was `true`"],
    ['bool', "`'false'` was `true`"],
    ['array', '`[null]`'],
  ])("the `output-type` issue says what differs for '%s'", (type, difference) => {
    const [raised] = convert({ operator: 'count', values: [1], outputType: type }).issues
    expect(raised.tag).toBe('intentional-semantic-change')
    expect(raised.message).toMatch(/^v3's `convert` is strict where v2 guessed: /)
    expect(raised.message).toContain(difference)
  })

  test('for a computed or unknown type, it lists every difference', () => {
    const computed = convert({ operator: 'count', values: [1], outputType: { $and: [] } })
    expect(computed.issues[0].message).toContain('the target type is computed')
    const unknown = convert({ operator: 'count', values: [1], outputType: 'integer' })
    expect(unknown.issues[0].message).toContain("`'integer'` is not one v2 had")
    for (const { message } of [computed.issues[0], unknown.issues[0]])
      for (const difference of ['`4.5`', "`'1,2'`", "`'false'`", '`[null]`'])
        expect(message).toContain(difference)
  })
})

describe('aliases → `vars`', () => {
  const EXAMPLES: Example[] = [
    {
      name: 'a definition used in the node',
      input: { operator: '=', $a: 1, values: ['$a', 1] },
      expected: { operator: 'equal', values: ['$vars.a', 1], vars: { a: 1 } },
    },
    {
      name: 'a definition used in a child',
      input: { operator: 'and', $t: true, values: [{ operator: '=', values: ['$t', true] }] },
      expected: {
        operator: 'and',
        values: [{ operator: 'equal', values: ['$vars.t', true] }],
        vars: { t: true },
      },
    },
    {
      name: 'a definition whose value is a node',
      input: { operator: 'or', $t: { $and: [true, true] }, values: ['$t'] },
      expected: {
        operator: 'or',
        values: ['$vars.t'],
        vars: { t: { operator: 'and', values: [true, true] } },
      },
    },
    {
      name: 'a definition naming a sibling, whole',
      input: { operator: '=', $a: 1, $b: '$a', values: ['$b', 1] },
      expected: { operator: 'equal', values: ['$vars.b', 1], vars: { a: 1, b: '$vars.a' } },
    },
    {
      name: 'a sibling inside a definition was text to v2',
      input: {
        operator: '=',
        $a: 1,
        $b: { operator: '=', values: ['$a', 1] },
        values: ['$b', false],
      },
      expected: {
        operator: 'equal',
        values: ['$vars.b', false],
        vars: { a: 1, b: { operator: 'equal', values: ['$a', 1] } },
      },
    },
    {
      // Read in the node's own scope, `$b` would be false
      name: 'a definition reads the enclosing scope, and a shadowing var is renamed',
      input: {
        operator: 'and',
        $a: 1,
        values: [
          {
            operator: 'and',
            $a: 2,
            $b: { operator: '=', values: ['$a', 1] },
            values: ['$b', '$a'],
          },
        ],
      },
      expected: {
        operator: 'and',
        values: [
          {
            operator: 'and',
            values: ['$vars.b', '$vars.a_2'],
            vars: { a_2: 2, b: { operator: 'equal', values: ['$vars.a', 1] } },
          },
        ],
        vars: { a: 1 },
      },
    },
    {
      name: 'a definition that names itself reads the enclosing one',
      input: {
        operator: 'and',
        $a: true,
        values: [{ operator: 'or', $a: { operator: '=', values: ['$a', true] }, values: ['$a'] }],
      },
      expected: {
        operator: 'and',
        values: [
          {
            operator: 'or',
            values: ['$vars.a_2'],
            vars: { a_2: { operator: 'equal', values: ['$vars.a', true] } },
          },
        ],
        vars: { a: true },
      },
    },
    {
      name: 'the fallback sees the node’s vars',
      input: { operator: '=', values: [1, 1], $a: 5, fallback: '$a' },
      expected: { operator: 'equal', values: [1, 1], fallback: '$vars.a', vars: { a: 5 } },
    },
    {
      name: '`.`, `[` and `]` become `_`, and a clash takes a suffix',
      input: { operator: '=', '$a.b': 1, $a_b: 1, '$c[0]': 2, values: ['$a.b', '$a_b'] },
      expected: {
        operator: 'equal',
        values: ['$vars.a_b_2', '$vars.a_b'],
        vars: { a_b_2: 1, a_b: 1, c_0_: 2 },
      },
    },
    {
      name: 'an alias named like a v3 namespace',
      input: { operator: '=', $data: 1, values: ['$data', 1] },
      expected: { operator: 'equal', values: ['$vars.data', 1], vars: { data: 1 } },
    },
    {
      name: 'a reference with no definition stays as text',
      input: { operator: '=', values: ['$nope', '$nope'] },
      expected: { operator: 'equal', values: ['$nope', '$nope'] },
    },
    {
      name: 'a definition of itself, with none outside, was its own text',
      input: { operator: '=', $a: '$a', values: ['$a', '$a'] },
      expected: { operator: 'equal', values: ['$vars.a', '$vars.a'], vars: { a: '$a' } },
    },
    {
      name: 'a name that needs no change keeps it, whatever the key order',
      input: { operator: '=', $a_b: 2, '$a.b': 1, values: ['$a.b', '$a_b'] },
      expected: {
        operator: 'equal',
        values: ['$vars.a_b_2', '$vars.a_b'],
        vars: { a_b: 2, a_b_2: 1 },
      },
    },
    {
      name: 'renamed names take suffixes in sorted order',
      input: { operator: '=', '$a]': 2, '$a[': 1, values: ['$a[', '$a]'] },
      expected: {
        operator: 'equal',
        values: ['$vars.a_', '$vars.a__2'],
        vars: { a__2: 2, a_: 1 },
      },
    },
    {
      name: 'with `evaluateFullObject`, a plain object’s `$` keys are its `vars`',
      input: { operator: '=', values: [{ $n: 5, a: '$n' }, { a: 5 }] },
      options: { evaluateFullObject: true },
      expected: {
        operator: 'equal',
        values: [{ a: '$vars.n', vars: { n: 5 } }, { a: 5 }],
      },
    },
  ]
  test.each(EXAMPLES)('$name', (example) => check(example))
})

describe('the `literal` wrap', () => {
  const EXAMPLES: Example[] = [
    {
      name: 'a node inside a plain object is data',
      input: { operator: '=', values: [{ a: { operator: 'and', values: [] } }, 1] },
      expected: {
        operator: 'equal',
        values: [{ operator: 'literal', value: { a: { operator: 'and', values: [] } } }, 1],
      },
    },
    {
      name: 'an object with nothing to quote is left alone',
      input: {
        operator: '=',
        values: [
          { a: 1, b: ['x'] },
          { a: 1, b: ['x'] },
        ],
      },
      expected: {
        operator: 'equal',
        values: [
          { a: 1, b: ['x'] },
          { a: 1, b: ['x'] },
        ],
      },
    },
    {
      name: 'a `$` key, a `vars` key and a `//` key are quoted',
      input: { operator: '=', values: [{ $nope: 1 }, { vars: { x: 1 } }, { '//': 'x' }] },
      expected: {
        operator: 'equal',
        values: [
          { operator: 'literal', value: { $nope: 1 } },
          { operator: 'literal', value: { vars: { x: 1 } } },
          { operator: 'literal', value: { '//': 'x' } },
        ],
      },
    },
    {
      name: 'shorthand inside a plain object is quoted',
      input: { operator: '=', values: [{ a: { $and: [] } }, 1] },
      expected: {
        operator: 'equal',
        values: [{ operator: 'literal', value: { a: { $and: [] } } }, 1],
      },
    },
    {
      name: 'text that v3 reads as a reference',
      input: { operator: '=', values: ['$data.x', '$d', '$database', 'a $data.x'] },
      expected: {
        operator: 'equal',
        values: [
          { operator: 'literal', value: '$data.x' },
          { operator: 'literal', value: '$d' },
          '$database',
          'a $data.x',
        ],
      },
      data: { x: '$data.x' },
    },
    {
      name: 'a reference inside a plain object quotes the object',
      input: { operator: '=', values: [{ a: ['$vars.x'] }, 1] },
      expected: {
        operator: 'equal',
        values: [{ operator: 'literal', value: { a: ['$vars.x'] } }, 1],
      },
    },
    {
      name: 'an array is walked element by element',
      input: { operator: '=', values: [['$data', { $and: [] }], 1] },
      expected: {
        operator: 'equal',
        values: [
          [
            { operator: 'literal', value: '$data' },
            { operator: 'and', values: [] },
          ],
          1,
        ],
      },
    },
    {
      name: 'with `evaluateFullObject`, a plain object is walked',
      input: { operator: '=', values: [{ a: { operator: 'and', values: [] } }, { a: true }] },
      options: { evaluateFullObject: true },
      expected: {
        operator: 'equal',
        values: [{ a: { operator: 'and', values: [] } }, { a: true }],
      },
    },
    {
      name: 'with `evaluateFullObject`, `vars` or `//` as data is built',
      input: {
        operator: '=',
        values: [
          { vars: 1, n: { $and: [] } },
          { vars: 1, n: true },
        ],
      },
      options: { evaluateFullObject: true },
      expected: {
        operator: 'equal',
        values: [
          {
            operator: 'buildObject',
            entries: [
              { key: 'vars', value: 1 },
              { key: 'n', value: { operator: 'and', values: [] } },
            ],
          },
          {
            operator: 'buildObject',
            entries: [
              { key: 'vars', value: 1 },
              { key: 'n', value: true },
            ],
          },
        ],
      },
    },
  ]
  test.each(EXAMPLES)('$name', (example) => check(example))
})

// Fails at evaluation in both engines, and passes v3's validate()
const failing = { operator: '/', values: [1, 0] }
const failingV3 = { operator: 'divide', value: 1, by: 0 }

describe('a result that is not a node', () => {
  const EXAMPLES: Example[] = [
    {
      name: 'a constant drops `fallback` and `useCache`, which could never apply',
      input: { operator: 'pass', value: 5, fallback: 0, useCache: true },
      expected: 5,
    },
    {
      name: 'a node takes the modifiers',
      input: { operator: 'pass', value: { $plus: [1, 2] }, fallback: 0, $a: 1 },
      expected: { operator: 'plus', values: [1, 2], fallback: 0, vars: { a: 1 } },
    },
    {
      name: "PASSTHRU's `useCache`, which v2 ignored, goes",
      input: { operator: 'pass', value: { $plus: [1, 2] }, useCache: true },
      expected: { operator: 'plus', values: [1, 2] },
    },
    {
      name: 'a `$data` reference with a `fallback` is a `get` with a default',
      input: { operator: 'pass', value: { $getData: 'nope' }, fallback: 'none' },
      expected: { operator: 'get', path: 'nope', missingPathDefault: 'none' },
    },
    {
      name: 'the whole of `data` is never missing',
      input: { operator: 'pass', value: { operator: 'getData', property: '' }, fallback: 'x' },
      data: { a: 1 },
      expected: '$data',
    },
    {
      name: 'a `$data` reference with vars to carry is a `get`',
      input: { operator: 'pass', $a: 1, value: { $getData: 'n' } },
      data: { n: 7 },
      expected: { operator: 'get', path: 'n', vars: { a: 1 } },
    },
    {
      name: "a reference to the node's own var is that var's value",
      input: { operator: 'pass', $a: { $plus: [1, 2] }, value: '$a' },
      expected: { operator: 'plus', values: [1, 2] },
    },
    {
      name: '… through a chain of them',
      input: { operator: 'pass', $a: { $plus: [1, 2] }, $b: '$a', value: '$b' },
      expected: { operator: 'plus', values: [1, 2] },
    },
    {
      name: '… keeping the vars its `fallback` reads',
      input: { operator: 'pass', $a: { $plus: [1, 2] }, $f: 0, value: '$a', fallback: '$f' },
      expected: { operator: 'plus', values: [1, 2], fallback: '$vars.f', vars: { f: 0 } },
    },
    {
      name: "another reference drops the node's modifiers",
      input: {
        operator: 'and',
        $a: true,
        values: [{ operator: 'pass', value: '$a', fallback: false, $b: 1 }],
      },
      expected: { operator: 'and', values: ['$vars.a'], vars: { a: true } },
    },
    {
      name: 'an array with vars goes inside a `convert`',
      input: { operator: 'pass', $n: 1, value: ['$n', 2] },
      expected: { operator: 'convert', value: ['$vars.n', 2], to: 'array', vars: { n: 1 } },
    },
    {
      name: 'an array with a `fallback` goes inside a `convert`',
      input: { operator: 'pass', value: [failing], fallback: [] },
      expected: { operator: 'convert', value: [failingV3], to: 'array', fallback: [] },
    },
    {
      name: 'an array of constants drops them all',
      input: { operator: 'pass', $n: 1, value: [1, 2], fallback: [] },
      expected: [1, 2],
    },
    {
      name: "an array's `outputType` is the `convert` that carries them",
      input: { operator: 'pass', $n: 1, value: ['$n'], outputType: 'array' },
      expected: { operator: 'convert', value: ['$vars.n'], to: 'array', vars: { n: 1 } },
      issues: [{ code: 'output-type', path: ['outputType'] }],
    },
    {
      name: 'with `evaluateFullObject`, an object takes the vars',
      input: { operator: 'pass', $n: 1, value: { a: '$n' } },
      options: { evaluateFullObject: true },
      expected: { a: '$vars.n', vars: { n: 1 } },
    },
    {
      name: 'with `evaluateFullObject`, an object with a `fallback` is built',
      input: { operator: 'pass', value: { a: failing, b: 2 }, fallback: {} },
      options: { evaluateFullObject: true },
      expected: {
        operator: 'buildObject',
        entries: [
          { key: 'a', value: failingV3 },
          { key: 'b', value: 2 },
        ],
        fallback: {},
      },
    },
    {
      name: "a node's own `fallback` that cannot fail leaves the outer one unreachable",
      input: {
        operator: 'pass',
        value: { operator: '+', values: [1, 2], fallback: 0 },
        fallback: 'outer',
      },
      expected: { operator: 'plus', values: [1, 2], fallback: 0 },
    },
    {
      name: "the outer `fallback` catches the node's own `fallback`, as in v2",
      input: {
        operator: 'pass',
        value: { ...failing, fallback: { ...failing, fallback: failing } },
        fallback: 'outer',
      },
      expected: {
        ...failingV3,
        fallback: { ...failingV3, fallback: { ...failingV3, fallback: 'outer' } },
      },
    },
    {
      name: 'vars merge, the outer first',
      input: { operator: 'pass', $a: 1, value: { operator: '+', $b: 2, values: ['$b', '$a'] } },
      expected: { operator: 'plus', values: ['$vars.b', '$vars.a'], vars: { a: 1, b: 2 } },
    },
    {
      name: 'comments merge, the inner first',
      input: { operator: 'pass', value: { operator: '+', values: [1], note: 'in' }, note: 'out' },
      expected: { '//': [{ note: 'in' }, { note: 'out' }], operator: 'plus', values: [1] },
    },
  ]
  test.each(EXAMPLES)('$name', (example) => check(example))
})

describe('values the output discards', () => {
  // A read of a missing path, which failed in v2, so a node that evaluated
  // it failed too
  const missing = { operator: 'getData', property: 'missing' }
  const EXAMPLES: Example[] = [
    {
      name: 'a cut value that v2 evaluated',
      input: { operator: '>', values: [3, 2, missing] },
      expected: { operator: 'greaterThan', values: [3, 2] },
      issues: [
        { code: 'values-cut', path: ['values'] },
        { code: 'discarded-expression', path: ['values', 2] },
      ],
      differs: { v2: { error: true }, v3: { value: true } },
    },
    {
      name: 'a cut constant, which could not fail, has nothing more to say',
      input: { operator: '>', values: [3, 2, 1] },
      expected: { operator: 'greaterThan', values: [3, 2] },
      issues: [{ code: 'values-cut', path: ['values'] }],
    },
    {
      name: "SUBTRACT's named pair beside `values`, which v2 evaluated",
      input: { operator: '-', values: [5, 2], from: missing },
      expected: { operator: 'subtract', value: 5, minus: 2 },
      issues: [
        { code: 'overridden-value', path: ['from'] },
        { code: 'discarded-expression', path: ['from'] },
      ],
      differs: { v2: { error: true }, v3: { value: 3 } },
    },
    {
      name: 'a computed `nullEqualsUndefined`, which v3 has no place for',
      input: { operator: '=', values: [1, 1], nullEqualsUndefined: missing },
      expected: { operator: 'equal', values: [1, 1] },
      issues: [{ code: 'discarded-expression', path: ['nullEqualsUndefined'] }],
      differs: { v2: { error: true }, v3: { value: true } },
    },
    {
      name: 'a computed `excludeTrailing`',
      input: { operator: 'split', value: 'a,b', delimiter: ',', excludeTrailing: missing },
      expected: { operator: 'split', value: 'a,b', delimiter: ',' },
      issues: [
        { code: 'split-trailing-empty', path: [] },
        { code: 'discarded-expression', path: ['excludeTrailing'] },
      ],
      differs: { v2: { error: true }, v3: { value: ['a', 'b'] } },
    },
    {
      name: 'a computed `substitutionCharacter` in named mode, which v2 then ignored',
      input: {
        operator: 'stringSubstitution',
        string: '{{x}}',
        substitutions: { x: 1 },
        substitutionCharacter: missing,
      },
      expected: {
        operator: 'buildString',
        template: '{{x}}',
        substitutions: { x: 1 },
        trim: true,
      },
      issues: [{ code: 'discarded-expression', path: ['substitutionCharacter'] }],
      differs: { v2: { error: true }, v3: { value: '1' } },
    },
    {
      name: 'alias definitions a constant result cannot carry',
      input: { operator: 'pass', value: 5, $x: missing },
      expected: 5,
      issues: [{ code: 'discarded-expression', path: ['$x'] }],
      differs: { v2: { error: true }, v3: { value: 5 } },
    },
    {
      name: 'a `fallback` that could never answer goes, with what was inside it',
      input: { operator: 'pass', value: 5, fallback: { operator: 'nope' } },
      expected: 5,
    },
    {
      name: 'the issues inside a deciding value go with it',
      input: { operator: '>', values: [1, 2], strict: { operator: 'nope' } },
      expected: {
        '//': decidingNote('`strict` is computed', '`greaterThan`'),
        operator: 'greaterThan',
        values: [1, 2],
      },
      issues: [{ code: 'deciding-value', path: ['strict'] }],
      differs: { v2: { error: true }, v3: { value: false } },
    },
    {
      name: "stage 1's issues inside a discarded value go too",
      input: { operator: '>', values: [1, 2], strict: { $plus: { values: [1] }, values: [2] } },
      expected: {
        '//': decidingNote('`strict` is computed', '`greaterThan`'),
        operator: 'greaterThan',
        values: [1, 2],
      },
      issues: [{ code: 'deciding-value', path: ['strict'] }],
      differs: { v2: { error: true }, v3: { value: false } },
    },
    {
      name: 'a deciding value that was data is quoted in its message as written',
      input: { operator: '>', values: [1, 2], strict: [{ $y: 1 }] },
      expected: {
        '//': decidingNote('`[{"$y":1}]` is not a value v2 accepted for `strict`', '`greaterThan`'),
        operator: 'greaterThan',
        values: [1, 2],
      },
      issues: [{ code: 'deciding-value', path: ['strict'] }],
      differs: { v2: { error: true }, v3: { value: false } },
    },
  ]
  test.each(EXAMPLES)('$name', (example) => check(example))
})

describe('fallbacks that caught missing data', () => {
  const MISSING: Raised = { code: 'missing-data-fallback', path: ['fallback'] }
  const EXAMPLES: Example[] = [
    {
      name: 'a read beneath a `fallback`',
      input: { operator: '+', values: [{ $getData: 'missing' }, 1], fallback: 0 },
      expected: { operator: 'plus', values: ['$data.missing', 1], fallback: 0 },
      issues: [MISSING],
      differs: { v2: { value: 0 }, v3: { value: null } },
    },
    {
      name: 'a read in a substitution',
      input: {
        operator: 'stringSubstitution',
        string: 'Hi %1',
        substitutions: [{ $getData: 'missing' }],
        fallback: 'Hi there',
      },
      expected: {
        operator: 'buildString',
        template: 'Hi %1',
        substitutions: ['$data.missing'],
        trim: true,
        fallback: 'Hi there',
      },
      issues: [MISSING],
      differs: { v2: { value: 'Hi there' }, v3: { value: 'Hi ' } },
    },
    {
      name: 'deeper down',
      input: {
        operator: '+',
        values: [{ operator: '*', values: [{ $getData: 'missing' }, 2] }, 1],
        fallback: 0,
      },
      expected: {
        operator: 'plus',
        values: [{ operator: 'multiply', values: ['$data.missing', 2] }, 1],
        fallback: 0,
      },
      issues: [MISSING],
      differs: { v2: { value: 0 }, v3: { value: null } },
    },
    {
      name: 'only the innermost `fallback`',
      input: {
        operator: 'and',
        values: [{ operator: '+', values: [{ $getData: 'missing' }, 1], fallback: 0 }],
        fallback: true,
      },
      expected: {
        operator: 'and',
        values: [{ operator: 'plus', values: ['$data.missing', 1], fallback: 0 }],
        fallback: true,
      },
      issues: [{ code: 'missing-data-fallback', path: ['values', 0, 'fallback'] }],
    },
    {
      name: 'a computed path',
      input: {
        operator: '+',
        values: [{ operator: 'getData', property: { $plus: ['miss', 'ing'] } }, 1],
        fallback: 0,
      },
      expected: {
        operator: 'plus',
        values: [{ operator: 'get', path: { operator: 'plus', values: ['miss', 'ing'] } }, 1],
        fallback: 0,
      },
      issues: [MISSING],
      differs: { v2: { value: 0 }, v3: { value: null } },
    },
    {
      name: 'a read with its own default is not one',
      input: {
        operator: '+',
        values: [{ operator: 'getData', property: 'missing', fallback: 5 }, 1],
        fallback: 0,
      },
      expected: {
        operator: 'plus',
        values: [{ operator: 'get', path: 'missing', missingPathDefault: 5 }, 1],
        fallback: 0,
      },
    },
    {
      name: 'nor is text that looked like one',
      input: { operator: '+', values: ['$data.x', 'y'], fallback: 0 },
      expected: {
        operator: 'plus',
        values: [{ operator: 'literal', value: '$data.x' }, 'y'],
        fallback: 0,
      },
    },
    {
      name: 'a read in the `fallback` is beneath the next one out',
      input: {
        operator: 'and',
        values: [{ operator: '=', values: [1, 1], fallback: { $getData: 'missing' } }],
        fallback: false,
      },
      expected: {
        operator: 'and',
        values: [{ operator: 'equal', values: [1, 1], fallback: '$data.missing' }],
        fallback: false,
      },
      issues: [MISSING],
    },
  ]
  test.each(EXAMPLES)('$name', (example) => check(example))

  test("v3's `strictDataPaths` fails where v2 did", async () => {
    const { expression } = convert(EXAMPLES[0].input)
    const strict = new FigTree({ strictDataPaths: true })
    expect(await v3Outcome(strict, expression)).toEqual({ value: 0 })
  })

  test("an `http` node's `returnPath`", async () => {
    const response = { a: 1, b: 2 }
    const http = new MockHttpClient({ defaultResponse: response })
    const fig = new FigTree({ operators: [coreOperators, httpOperators(http)] })
    await check(
      {
        name: '',
        input: { operator: 'GET', url: 'https://x.test', returnProperty: 'zz', fallback: 0 },
        expected: { operator: 'http', url: 'https://x.test', returnPath: 'zz', fallback: 0 },
        issues: [{ code: 'response-collapse', path: [] }, MISSING],
        differs: { v2: { value: 0 }, v3: { value: null } },
      },
      fig,
      { httpClient: v2HttpClient(response, []) }
    )
  })
})

describe("OBJECT_PROPERTIES' `fallback` beside `outputType`", () => {
  const EXAMPLES: Example[] = [
    {
      name: '`convert` converts the default, where v2 returned the fallback as it was',
      input: { operator: 'getData', property: 'nope', fallback: 'N/A', outputType: 'number' },
      expected: {
        operator: 'convert',
        value: { operator: 'get', path: 'nope', missingPathDefault: 'N/A' },
        to: 'number',
      },
      issues: [
        { code: 'fallback-converted', path: ['fallback'] },
        { code: 'output-type', path: ['outputType'] },
      ],
      differs: { v2: { value: 'N/A' }, v3: { error: true } },
    },
    {
      name: 'a default already of the type',
      input: { operator: 'getData', property: 'nope', fallback: 0, type: 'number' },
      expected: {
        operator: 'convert',
        value: { operator: 'get', path: 'nope', missingPathDefault: 0 },
        to: 'number',
      },
      issues: [{ code: 'output-type', path: ['type'] }],
    },
    {
      name: 'a computed default',
      input: {
        operator: 'getData',
        property: 'nope',
        fallback: { $plus: ['1', '2'] },
        outputType: 'number',
      },
      expected: {
        operator: 'convert',
        value: {
          operator: 'get',
          path: 'nope',
          missingPathDefault: { operator: 'plus', values: ['1', '2'] },
        },
        to: 'number',
      },
      issues: [
        { code: 'fallback-converted', path: ['fallback'] },
        { code: 'output-type', path: ['outputType'] },
      ],
      differs: { v2: { value: '12' }, v3: { value: 12 } },
    },
  ]
  test.each(EXAMPLES)('$name', (example) => check(example))

  test('the issue names the type', () => {
    const { issues } = convert({
      operator: 'getData',
      property: 'nope',
      fallback: 'N/A',
      outputType: 'bool',
    })
    expect(issues[0].message).toBe(
      "This `fallback` becomes `missingPathDefault`, which v3's `convert` then converts to " +
        '`boolean`, where v2 returned it as it was. Unless the default is already of that ' +
        'type, it fails or changes. Give a default of that type.'
    )
  })
})

describe('keys v2 ignored', () => {
  const EXAMPLES: Example[] = [
    {
      name: 'go into a `//` object',
      input: { operator: '=', values: [1, 1], comment: 'same', by: { $and: [] } },
      expected: {
        '//': { comment: 'same', by: { $and: [] } },
        operator: 'equal',
        values: [1, 1],
      },
    },
    {
      name: "an author's own `//` is the comment",
      input: { operator: '=', values: [1, 1], '//': 'same' },
      expected: { '//': 'same', operator: 'equal', values: [1, 1] },
    },
    {
      name: "an author's `//` beside other ignored keys",
      input: { operator: '=', values: [1, 1], '//': 'same', by: 'me' },
      expected: { '//': ['same', { by: 'me' }], operator: 'equal', values: [1, 1] },
    },
    {
      name: 'notes first, then the comment, then the ignored keys',
      input: { operator: '>', values: [2, 1], strict: 'yes', '//': 'same', by: 'me' },
      expected: {
        '//': [
          decidingNote("`'yes'` is not a value v2 accepted for `strict`", '`greaterThan`'),
          'same',
          { by: 'me' },
        ],
        operator: 'greaterThan',
        values: [2, 1],
      },
      issues: [{ code: 'deciding-value', path: ['strict'] }],
      differs: { v2: { error: true }, v3: { value: true } },
    },
  ]
  test.each(EXAMPLES)('$name', (example) => check(example))
})

describe('placeholders', () => {
  test('an unknown operator is quoted whole, with its note', async () => {
    const input = { operator: 'nope', values: [{ $and: [] }], fallback: 'x' }
    await check({
      name: '',
      input,
      expected: { '//': unknownNote('nope'), operator: 'literal', value: input },
      issues: [{ code: 'unknown-operator', path: ['operator'] }],
      differs: { v2: { value: 'x' }, v3: { value: input } },
    })
  })

  test('an operator that is not a string is unknown', () => {
    const { expression, issues } = convert({ operator: 5 })
    expect(expression).toEqual({
      '//': unknownNote('5'),
      operator: 'literal',
      value: { operator: 5 },
    })
    expect(issues.map(({ code }) => code)).toEqual(['unknown-operator'])
  })

  test('a computed `children` that cannot be split is quoted whole', async () => {
    const input = { operator: '?', children: '$c', $c: [true, 1, 2] }
    await check({
      name: '',
      input,
      expected: {
        '//':
          `${NOTE}\`children\` is computed, and \`?\` sends its children to different ` +
          'parameters, which cannot be split before evaluation. The node is quoted unconverted. ' +
          'Rewrite it with named parameters.',
        operator: 'literal',
        value: input,
      },
      issues: [{ code: 'computed-children', path: ['children'] }],
      differs: { v2: { value: 1 }, v3: { value: input } },
    })
  })

  test('a shorthand whose payload names an unknown operator is quoted whole', async () => {
    const input = { $or: { operator: 'nope' } }
    await check({
      name: '',
      input,
      expected: { '//': unknownNote('nope'), operator: 'literal', value: input },
      issues: [{ code: 'unknown-operator', path: ['$or', 'operator'] }],
      differs: { v2: { error: true }, v3: { value: input } },
    })
  })

  test('so is one inside an alias definition, with `evaluateFullObject`', () => {
    const inner = { $or: { operator: 1 } }
    const { expression, issues } = convert({ $c: inner, x: '$c' }, { evaluateFullObject: true })
    expect(expression).toEqual({
      x: '$vars.c',
      vars: { c: { '//': unknownNote('1'), operator: 'literal', value: inner } },
    })
    expect(issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unknown-operator', path: ['$c', '$or', 'operator'] },
    ])
  })

  test('a shorthand with a computed `children` that cannot be split is quoted whole', async () => {
    const input = { '$?': { children: '$c' }, $c: [true, 1, 2] }
    await check({
      name: '',
      input,
      expected: {
        '//':
          `${NOTE}\`children\` is computed, and \`?\` sends its children to different ` +
          'parameters, which cannot be split before evaluation. The node is quoted unconverted. ' +
          'Rewrite it with named parameters.',
        operator: 'literal',
        value: input,
      },
      issues: [{ code: 'computed-children', path: ['$?', 'children'] }],
      differs: { v2: { value: 1 }, v3: { value: input } },
    })
  })

  test('a computed `children` that goes whole into one parameter converts', async () => {
    await check({
      name: '',
      input: { operator: 'and', children: '$c', $c: [true, 1] },
      expected: { operator: 'and', values: '$vars.c', vars: { c: [true, 1] } },
    })
  })

  test('only `non-convertible` issues leave a note', () => {
    const { expression } = convert({ operator: 'split', value: 'a', outputType: 'array' })
    expect(JSON.stringify(expression)).not.toContain(NOTE)
  })

  test('a placeholder deep in the tree', () => {
    const { expression, issues } = convert({ operator: 'and', values: [true, { operator: 'y' }] })
    expect(expression).toEqual({
      operator: 'and',
      values: [true, { '//': unknownNote('y'), operator: 'literal', value: { operator: 'y' } }],
    })
    expect(issues.map(({ path }) => path)).toEqual([['values', 1, 'operator']])
  })
})

describe('source paths', () => {
  test.each([
    ['a shorthand payload', { $greaterThan: [3, 2, 1] }, ['$greaterThan']],
    ['`children`', { operator: '>', children: [3, 2, 1] }, ['children']],
    [
      'a child in `children`',
      { operator: 'and', children: [{ operator: 'y' }] },
      ['children', 0, 'operator'],
    ],
    [
      'a node in a shorthand array',
      { $or: [false, { $greaterThan: [3, 2, 1] }] },
      ['$or', 1, '$greaterThan'],
    ],
  ])('an issue about %s reports where the value was', (_, input, path) => {
    expect(convert(input).issues[0].path).toEqual(path)
  })

  test('a parameter given by alias reports at the alias', () => {
    const { issues } = convert({
      operator: 'split',
      value: 'a',
      separator: { $conditional: [true, ',', ';'] },
      removeTrailing: false,
    })
    expect(issues.map(({ code, path }) => [code, path])).toEqual([
      ['computed-delimiter', ['separator']],
    ])
  })

  test.each([
    [
      'a pair beaten by `values`, given by alias',
      { operator: '-', values: [3, 1], subtractFrom: 9 },
      [['overridden-value', ['subtractFrom']]],
    ],
    [
      'an entry paired from `children`',
      { operator: 'buildObject', children: ['a', 1, 'b'] },
      [['malformed-entry', ['children']]],
    ],
    [
      'a mapped token, under an alias of `numberMapping`',
      { operator: 'stringSubstitution', string: '{{n}}', numMap: { n: { other: 'x' } } },
      [['number-mapping', ['numMap', 'n']]],
    ],
    [
      'a remainder read from shorthand',
      { $divide: { values: [7, 2], output: 'remainder' } },
      [['remainder-sign', ['$divide', 'output']]],
    ],
  ])('an issue about %s reports where the value was', (_, input, raised) => {
    expect(convert(input).issues.map(({ code, path }) => [code, path])).toEqual(raised)
  })

  test('the losing key is named as the author wrote it', () => {
    const [raised] = convert({ operator: '-', values: [3, 1], subtractFrom: 9 }).issues
    expect(raised.message).toBe(
      'v2 never read `subtractFrom`: `values` gave the same parameter and won. Removed.'
    )
  })

  test("stage 1's issues come first", () => {
    const { issues } = convert({ $greaterThan: { values: [1, 2, 3] }, values: [3, 2, 1] })
    expect(issues.map(({ code, path }) => [code, path])).toEqual([
      ['overridden-value', ['$greaterThan', 'values']],
      ['values-cut', ['values']],
    ])
  })
})
