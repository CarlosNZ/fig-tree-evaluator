/**
 * Phase 15.1 — what holds for every conversion ("The tests" in
 * docs-dev/v3-specs/v3-converter.md).
 *
 * It never throws, over malformed input. It never mutates, since every input
 * and options object here is deep-frozen, and writing to one would throw. It
 * is deterministic: the same arguments give the same result whatever was
 * converted before, and reordering an input's keys changes nothing but what
 * follows the input's order.
 */
import { FigTree, type MigrationIssue, type MigrationResult, type V2Options } from '../src'
import { migrateV2Expression, migrateV2Fragments } from '../src/migrate'
import { V2_NAMES, V2_PARAMETERS } from '../src/migrate/v2/operators.generated'
import { clone, deepFreeze, v2Outcome } from './helpers/migration'
import { JUNK, randomCases } from './helpers/randomV2'

const frozen = <T>(value: T): T => deepFreeze(clone(value)) as T

const NOTE = 'v2 conversion: '

const FRAGMENTS = {
  adder: { operator: '+', values: '$values' },
  greet: {
    operator: 'stringSubstitution',
    string: 'Hello %1',
    substitutions: ['$name'],
    metadata: { parameters: [{ name: '$name', type: 'string', default: 'you' }] },
  },
}

/** Both conversions of an input, from frozen copies */
const convertBoth = (input: unknown, options: unknown) => ({
  expression: migrateV2Expression(frozen(input), frozen(options) as V2Options),
  fragments: migrateV2Fragments(frozen(options) as V2Options),
})

describe('it never throws, over malformed input', () => {
  const EXPRESSIONS: [string, unknown][] = [
    ['a non-string `operator`', { operator: 5 }],
    ['an object `operator`', { operator: { operator: '+' } }],
    ['a null `operator`', { operator: null, values: [1] }],
    ['`values: 5`', { operator: '+', values: 5 }],
    ["`children: 'x'`", { operator: '?', children: 'x' }],
    ['`children: null`', { operator: '-', children: null }],
    ['`null` where a node goes', { operator: '?', condition: null, valueIfTrue: null }],
    ['`null` as a shorthand payload', { $plus: null }],
    ['`null` as a fragment name', { fragment: null }],
    ['`null` as `parameters`', { fragment: 'adder', parameters: null }],
    ['a node inside `parameters` keys', { fragment: 'adder', parameters: { $values: null } }],
    ['`null` as a fallback', { operator: '+', values: [1], fallback: null }],
    ['an empty object', {}],
    ['an empty `$` key', { $: 1 }],
    ['a shorthand whose payload names an unknown operator', { $or: { operator: 1 } }],
    ['arrays of arrays', [[[{ operator: 'and' }]]]],
    ['`undefined` values', { operator: '+', values: [undefined, 1], fallback: undefined }],
    ['a top-level primitive', 'hello'],
    ['`undefined` itself', undefined],
  ]

  test.each(EXPRESSIONS)('%s', (_name, input) => {
    expect(() => convertBoth(input, { fragments: FRAGMENTS })).not.toThrow()
  })

  const OPTIONS: [string, unknown][] = [
    ['`null`', null],
    ['a number', 5],
    ['`fragments: null`', { fragments: null }],
    ['`fragments: 5`', { fragments: 5 }],
    ["`fragments: 'f'`", { fragments: 'f' }],
    ['a `null` definition', { fragments: { f: null } }],
    ['`metadata: 5`', { fragments: { f: { operator: '+', values: [1], metadata: 5 } } }],
    [
      '`metadata.parameters: 5`',
      { fragments: { f: { operator: '+', values: [1], metadata: { parameters: 5 } } } },
    ],
    [
      'malformed declarations',
      {
        fragments: {
          f: {
            operator: '+',
            values: ['$a'],
            metadata: { parameters: [null, 5, { name: 5 }, { name: '$a', default: undefined }] },
          },
        },
      },
    ],
    ['`functions: null`', { functions: null }],
    ["`functions: 'fn'`", { functions: 'fn' }],
    ['non-string function names', { functions: [5, null, 'fn'] }],
    ['non-boolean flags', { evaluateFullObject: 1, noShorthand: 'no', caseInsensitive: {} }],
  ]

  test.each(OPTIONS)('options: %s', (_name, options) => {
    const input = { operator: '+', values: [{ fragment: 'f' }, { $fn: [1] }, '$a'] }
    expect(() => convertBoth(input, options)).not.toThrow()
  })

  const PARAMETERS = Object.entries(V2_NAMES).flatMap(([name, operator]) =>
    V2_PARAMETERS[operator].flatMap(({ name: parameter, aliases }) =>
      [parameter, ...aliases].map((key) => [name, key] as const)
    )
  )

  test('every v2 name, with every parameter spelling, given every junk value', () => {
    for (const [name, key] of PARAMETERS)
      for (const junk of JUNK)
        for (const options of [{}, { evaluateFullObject: true }]) {
          const input = { operator: name, [key]: junk }
          expect(() => convertBoth(input, options)).not.toThrow()
          expect(() => convertBoth({ [`$${name}`]: { [key]: junk } }, options)).not.toThrow()
        }
  })

  test('random input', () => {
    for (const { input, options } of randomCases(1, 600))
      expect(() => convertBoth(input, options)).not.toThrow()
  })

  // No JSON config holds these, but a script may pass any object. Neither
  // goes through `frozen`, whose copy would overflow too.
  let deep: unknown = 1
  for (let i = 0; i < 5000; i++) deep = { operator: '+', values: [deep, 1] }
  const cyclic: { operator: string; values: unknown[] } = { operator: '+', values: [] }
  cyclic.values.push(cyclic)

  test.each([
    ['nested past the stack', deep],
    ['holding itself', cyclic],
  ])('input %s is quoted unconverted, with an issue', (_name, input) => {
    const { expression, issues } = migrateV2Expression(input)
    expect(expression).toMatchObject({ '//': expect.stringContaining(NOTE), operator: 'literal' })
    expect((expression as { value: unknown }).value).toBe(input)
    expect(issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unconvertible-input', path: [] },
    ])

    const converted = migrateV2Fragments({ fragments: { f: input } })
    expect(converted.fragments.f.expression).toMatchObject({ operator: 'literal' })
    expect((converted.fragments.f.expression as { value: unknown }).value).toBe(input)
    expect(converted.issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unconvertible-input', path: ['f'] },
    ])
  })
})

describe('it never mutates', () => {
  test('its arguments are unchanged, and it never needs them writable', () => {
    for (const { input, options } of randomCases(2, 200)) {
      const before = clone({ input, options })
      convertBoth(input, options)
      expect(clone({ input, options })).toEqual(before)
    }
  })
})

describe('it is deterministic', () => {
  test('a result does not depend on what was converted before', () => {
    const call = { fragment: 'adder', parameters: { $values: [1, 2] } }
    const first = migrateV2Expression(frozen(call), frozen({ fragments: FRAGMENTS }))
    migrateV2Expression(frozen(call), frozen({ fragments: { adder: { operator: '*' } } }))
    migrateV2Expression(frozen(call))
    expect(migrateV2Expression(frozen(call), frozen({ fragments: FRAGMENTS }))).toEqual(first)
  })

  test('fragments changed between calls are read afresh', () => {
    const options: V2Options = { fragments: clone(FRAGMENTS) as Record<string, unknown> }
    const call = { fragment: 'greet', parameters: { $name: 'Ada', $title: 'Dr' } }
    const before = migrateV2Expression(call, options)
    expect(before.issues.map(({ code }) => code)).toEqual(['unknown-argument'])
    ;(options.fragments!.greet as { substitutions: unknown[] }).substitutions.push('$title')
    const after = migrateV2Expression(call, options)
    expect(after.issues).toEqual([])
    expect(after.expression).toEqual({
      fragment: 'greet',
      parameters: { name: 'Ada', title: 'Dr' },
    })
  })

  test('fragments whose JSON hides what they hold are never served from the last call', () => {
    // Both bodies write the same JSON, and read different placeholders
    const body = (reads: string) => ({
      operator: '+',
      values: [reads, 1],
      toJSON: () => 'the same',
    })
    const call = (name: string) => ({ fragment: 'f', parameters: { [name]: 1 } })
    migrateV2Expression(call('$a'), { fragments: { f: body('$a') } })
    const after = migrateV2Expression(call('$b'), { fragments: { f: body('$b') } })
    expect(after.issues).toEqual([])
    expect(after.expression).toEqual({ fragment: 'f', parameters: { b: 1 } })
  })

  // An input with its keys in reverse order, all the way down
  const reversed = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reversed)
    if (typeof value !== 'object' || value === null) return value
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reversed(v)])
    )
  }

  // What must not follow key order: the output without its notes and
  // comments, whose text quotes the input, and the issues without theirs
  const withoutComments = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutComments)
    if (typeof value !== 'object' || value === null) return value
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '//')
        .map(([key, v]) => [key, withoutComments(v)])
    )
  }
  const located = (issues: MigrationIssue[]) =>
    issues.map(({ code, tag, path }) => `${code} ${tag} ${JSON.stringify(path)}`).sort()
  const comparable = ({ expression, issues }: MigrationResult) => ({
    expression: withoutComments(expression),
    issues: located(issues),
  })

  // The random cases spell no parameter twice, so v2 read none of them by
  // key order
  test('reordering keys changes nothing but what follows the input’s order', () => {
    for (const { input, options } of randomCases(3, 600)) {
      const forward = convertBoth(input, options)
      const backward = convertBoth(reversed(input), reversed(options))
      expect({ input, ...comparable(backward.expression) }).toEqual({
        input,
        ...comparable(forward.expression),
      })
      expect(withoutComments(backward.fragments.fragments)).toEqual(
        withoutComments(forward.fragments.fragments)
      )
      expect(located(backward.fragments.issues)).toEqual(located(forward.fragments.issues))
    }
  })

  test.each([
    ['a later `$` key over an earlier one', { $plus: [1, 2], $multiply: [3, 4] }],
    [
      'a parameter by alias after its name',
      { operator: '?', condition: true, valueIfTrue: 'a', ifTrue: 'b', valueIfFalse: 'c' },
    ],
  ])('where v2 read the later spelling (%s), so does the output', async (_name, input) => {
    for (const ordered of [input, reversed(input)]) {
      const { expression, issues } = migrateV2Expression(frozen(ordered))
      expect(issues.map(({ code }) => code)).toEqual(['overridden-value'])
      expect({ value: await new FigTree().evaluate(expression) }).toEqual(await v2Outcome(ordered))
    }
  })
})
