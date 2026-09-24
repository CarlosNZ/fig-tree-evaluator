/**
 * Phase 15.1 — what surrounds the rules ("Rules that cut across operators"
 * and "Placeholders" in docs-dev/v3-specs/v3-converter.md): the modifiers,
 * aliases → `vars`, the `literal` wrap, keys v2 ignored, placeholders and
 * their notes, and source paths. Tested through batch 1, whose rules are
 * renames, so what each example shows is the frame.
 *
 * Each converts to the output given, validates in v3, and evaluates the same
 * in the published v2 package and in v3, or differs as its row says.
 *
 * TO-DO: with batches 2 to 5 (chunk 5), results that are not nodes, the
 * objects an operator evaluated itself, and fallbacks that caught missing
 * data.
 */
import { FigTree } from '../src'
import type { V2Options } from '../src/migrationTypes'
import { convertV2 } from '../src/migrate/convert'
import type { IssueCode, Path } from '../src/migrate/issues'
import {
  clone,
  deepFreeze,
  v2Outcome,
  v3Errors,
  v3Outcome,
  type Outcome,
} from './helpers/migration'

const v3 = new FigTree()

const convert = (input: unknown, options: V2Options = {}) =>
  convertV2(deepFreeze(clone(input)), options)

interface Example {
  name: string
  input: unknown
  options?: V2Options
  data?: Record<string, unknown>
  expected: unknown
  issues?: { code: IssueCode; path: Path }[]
  /** Where the engines differ, each one's outcome */
  differs?: { v2: Outcome; v3: Outcome }
}

const NOTE = 'v2 conversion: '
const decidingNote = (reason: string, wrote: string) =>
  `${NOTE}${reason}, so the converter cannot tell what v2 did. It wrote ${wrote}, v2's ` +
  'default. Where `strict` can be otherwise, rewrite the node by hand.'
const unknownNote = (name: string) =>
  `${NOTE}\`${name}\` is not a v2 operator. If it is a custom function, add it to \`functions\` and convert again. The node is quoted unconverted.`

const check = async ({ input, options = {}, data, expected, issues = [], differs }: Example) => {
  const { expression, issues: raised } = convert(input, options)
  expect(expression).toEqual(expected)
  expect(raised.map(({ code, path }) => ({ code, path }))).toEqual(issues)
  expect(v3Errors(v3, expression, data)).toEqual([])
  const v2 = await v2Outcome(input, { ...options, data })
  const converted = await v3Outcome(v3, expression, data)
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
  test.each(EXAMPLES)('$name', check)

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
        values: ['$vars.a_b', '$vars.a_b_2'],
        vars: { a_b: 1, a_b_2: 1, c_0_: 2 },
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
      name: 'with `evaluateFullObject`, a plain object’s `$` keys are its `vars`',
      input: { operator: '=', values: [{ $n: 5, a: '$n' }, { a: 5 }] },
      options: { evaluateFullObject: true },
      expected: {
        operator: 'equal',
        values: [{ a: '$vars.n', vars: { n: 5 } }, { a: 5 }],
      },
    },
  ]
  test.each(EXAMPLES)('$name', check)
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
  test.each(EXAMPLES)('$name', check)
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
  test.each(EXAMPLES)('$name', check)
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

  test("stage 1's issues come first", () => {
    const { issues } = convert({ $greaterThan: { values: [1, 2, 3] }, values: [3, 2, 1] })
    expect(issues.map(({ code, path }) => [code, path])).toEqual([
      ['overridden-value', ['$greaterThan', 'values']],
      ['values-cut', ['values']],
    ])
  })
})
