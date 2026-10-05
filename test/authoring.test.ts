/**
 * The `./authoring` surface and `fallbackCoverage` without a timeout ("The
 * rules" in docs-dev/v3-specs/v3-authoring.md). The timeout rule has its own
 * suite, test/authoring-timeout.test.ts.
 *
 * The subpath's types export from the root. test/exports.test.ts lists
 * values only, so they are checked here, where `pnpm typecheck` fails if one
 * goes missing.
 */
import { ErrorCodes, FigTree } from '../src'
import type { FallbackCoverage, FallbackCoverageOptions } from '../src'
import * as authoring from '../src/authoring'
import { fallbackCoverage } from '../src/authoring'

const fig = new FigTree()
const uncovered = (expression: unknown, instance: FigTree = fig) =>
  fallbackCoverage(instance, expression).uncovered

const divide = { $divide: ['$data.a', '$data.b'] }

test('the subpath exports fallbackCoverage alone, and its types from the root', () => {
  expect(Object.keys(authoring)).toEqual(['fallbackCoverage'])
  const options: FallbackCoverageOptions = { timeout: 50 }
  const result: FallbackCoverage = fallbackCoverage(fig, 1, options)
  expect(result).toEqual({ uncovered: [] })
})

describe('the examples from #209', () => {
  test.each([
    ['a constant root', { plain: ['data', { nested: true }] }, []],
    ['an operator root, constant arguments and all', { $plus: [1, 2] }, [[]]],
    ['an operator root reading data', { $plus: ['$data.a', 1] }, [[]]],
    [
      'each top-level value of plain data, listed by its own path',
      { a: divide, b: { $equal: ['$data.y', 1] } },
      [['a'], ['b']],
    ],
    ['a root covered by a constant fallback', { ...divide, fallback: 0 }, []],
    [
      'an inner fallback, which never covers the node above it',
      { greeting: { $buildString: ['Hi %1', { $upper: '$data.n', fallback: 'there' }] } },
      [['greeting']],
    ],
    [
      'a reference, which cannot throw without strictDataPaths',
      { a: '$data.x', b: { $upper: '$data.y', fallback: '' } },
      [],
    ],
  ])('%s', (_label, expression, expected) => {
    expect(uncovered(expression)).toEqual(expected)
  })

  test('adding a fallback at each listed path covers the expression', () => {
    const before = { a: divide, b: { $equal: ['$data.y', 1] }, c: '$data.z' }
    expect(uncovered(before)).toEqual([['a'], ['b']])
    const after = { ...before, a: { ...divide, fallback: 0 }, b: { ...before.b, fallback: false } }
    expect(uncovered(after)).toEqual([])
  })
})

describe('a fallback covers only when it cannot throw itself', () => {
  test.each([
    ['a constant', 'n/a', []],
    ['null', null, []],
    ['a reference', '$data.backup', []],
    ['plain data holding only references', { from: '$data.backup' }, []],
    ['an operator node with no fallback of its own', { $get: 'backup' }, [[]]],
    ['an operator node with a fallback of its own', { $get: 'backup', fallback: null }, []],
    ['plain data holding an operator node', { from: { $get: 'backup' } }, [[]]],
  ])('%s', (_label, fallback, expected) => {
    expect(uncovered({ ...divide, fallback })).toEqual(expected)
  })
})

describe('an operatorDefaults fallback', () => {
  test('covers a node with none of its own, as a value never evaluated', () => {
    const withDefault = new FigTree({ operatorDefaults: { divide: { fallback: 0 } } })
    expect(uncovered({ a: divide }, withDefault)).toEqual([])
    // Returned as it is, so even a reference-shaped string cannot throw
    const literal = new FigTree({ operatorDefaults: { divide: { fallback: '$data.x' } } })
    expect(uncovered({ a: divide }, literal)).toEqual([])
    // Another operator's default covers nothing here
    const other = new FigTree({ operatorDefaults: { plus: { fallback: 0 } } })
    expect(uncovered({ a: divide }, other)).toEqual([['a']])
  })
})

describe('$vars references, through their definitions', () => {
  test.each([
    ['a var defined by a reference', { vars: { user: '$data.user' }, name: '$vars.user.name' }, []],
    [
      'a var defined by an uncovered node',
      { vars: { total: { $plus: ['$data.a', 1] } }, t: '$vars.total' },
      [['t']],
    ],
    [
      'a var defined by a covered node',
      { vars: { total: { $plus: ['$data.a', 1], fallback: 0 } }, t: '$vars.total' },
      [],
    ],
    [
      'a var through another var',
      { vars: { a: { $upper: '$data.s' }, b: '$vars.a' }, t: '$vars.b' },
      [['t']],
    ],
    [
      'the holes of a nested plain object with vars, each by its own path',
      { section: { vars: { x: '$data.x' }, a: '$vars.x', b: { $upper: 'x' } } },
      [['section', 'b']],
    ],
    [
      "a node's own vars, read by its fallback",
      { a: { vars: { v: { $upper: '$data.s' } }, $lower: '$data.t', fallback: '$vars.v' } },
      [['a']],
    ],
    [
      "a node's own vars, covered, read by its fallback",
      {
        a: {
          vars: { v: { $upper: '$data.s', fallback: '' } },
          $lower: '$data.t',
          fallback: '$vars.v',
        },
      },
      [],
    ],
  ])('%s', (_label, expression, expected) => {
    expect(uncovered(expression)).toEqual(expected)
  })
})

describe('strictDataPaths', () => {
  const strict = new FigTree({ strictDataPaths: true })

  test('a reference that drills may throw, a bare namespace may not', () => {
    expect(uncovered({ a: '$data.x', b: '$data' }, strict)).toEqual([['a']])
    expect(uncovered({ a: '$data.x', b: '$data' })).toEqual([])
  })

  test('a reference fallback that drills no longer covers', () => {
    expect(uncovered({ ...divide, fallback: '$data.backup' }, strict)).toEqual([[]])
  })

  test('a var drilled past its name may throw, the var itself may not', () => {
    const vars = { user: '$data' }
    expect(uncovered({ vars, a: '$vars.user', b: '$vars.user.name' }, strict)).toEqual([['b']])
  })
})

describe('fragment calls', () => {
  const withFragments = new FigTree({
    fragments: {
      safe: { expression: { $upper: '$data.s', fallback: '$data.t' } },
      unsafe: { expression: { $upper: '$data.s' } },
      echo: {
        expression: { $upper: '$params.s', fallback: '$params.s' },
        parameters: { s: { type: 'string' } },
      },
      card: { expression: { title: { $upper: '$data.t', fallback: '' }, body: '$data.b' } },
    },
  })
  const calls = (expression: unknown) => uncovered(expression, withFragments)

  test('a call takes its own fallback', () => {
    expect(calls({ a: { $unsafe: {}, fallback: 0 } })).toEqual([])
  })

  test('with none, a call takes its body: a root covered by a safe fallback covers it', () => {
    expect(calls({ a: { $safe: {} } })).toEqual([])
    expect(calls({ a: { $unsafe: {} } })).toEqual([['a']])
    expect(calls({ a: { $card: {} } })).toEqual([])
  })

  test('a body is analysed apart from its arguments, so $params may throw', () => {
    expect(calls({ a: { $echo: { s: 'x' } } })).toEqual([['a']])
  })

  test('dynamic arguments are checked before the body runs', () => {
    expect(calls({ a: { fragment: 'safe', parameters: '$data.args' } })).toEqual([['a']])
  })

  test('a call to an unknown fragment may throw', () => {
    expect(calls({ a: { fragment: 'nope' } })).toEqual([['a']])
  })
})

test('an invalid node is listed', () => {
  expect(uncovered({ a: { operator: 'plus', fragment: 'f' }, b: 1 })).toEqual([['a']])
})

describe('misuse', () => {
  test('anything but a FigTree instance is a TypeError', () => {
    expect(() => fallbackCoverage({}, 1)).toThrow(TypeError)
    expect(() => fallbackCoverage(undefined, 1)).toThrow(TypeError)
  })

  test('a bad timeout is refused as evaluate() refuses it', () => {
    for (const timeout of [0, -1, Number.NaN, Infinity, '50' as unknown as number])
      expect(() => fallbackCoverage(fig, 1, { timeout })).toThrow(
        expect.objectContaining({ code: ErrorCodes.invalidOptions })
      )
  })
})
