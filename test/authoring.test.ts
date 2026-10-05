/**
 * The `./authoring` surface and `fallbackCoverage` without a timeout
 * (docs-dev/v3-specs/v3-fallback-coverage.md). The timeout rule has its own
 * suite, test/authoring-timeout.test.ts, and the case corpus with the
 * soundness check is test/coverage-cases.test.ts.
 *
 * Every operator node carries one placeholder finding until the operators'
 * failure rules land, so these tests are about where findings sit and which
 * fallback covers them.
 *
 * The subpath's types export from the root. test/exports.test.ts lists
 * values only, so they are checked here, where `pnpm typecheck` fails if one
 * goes missing.
 */
import { ErrorCodes, FigTree } from '../src'
import type {
  CoverageFinding,
  CoveredFinding,
  FallbackCoverage,
  FallbackCoverageOptions,
} from '../src'
import * as authoring from '../src/authoring'
import { fallbackCoverage } from '../src/authoring'

const fig = new FigTree()

/** Each finding as where it starts, its code, and what covers it. */
const where = (finding: CoverageFinding | CoveredFinding) => ({
  path: finding.path,
  code: finding.code,
  ...(finding.fragment !== undefined
    ? { fragment: finding.fragment, fragmentPath: finding.fragmentPath }
    : {}),
  ...('coveredBy' in finding ? { by: finding.coveredBy } : {}),
  ...('coveredByFragmentPath' in finding ? { byFragmentPath: finding.coveredByFragmentPath } : {}),
})

const coverage = (expression: unknown, instance: FigTree = fig) => {
  const { uncovered, covered } = fallbackCoverage(instance, expression)
  return { uncovered: uncovered.map(where), covered: covered.map(where) }
}
const uncovered = (expression: unknown, instance: FigTree = fig) =>
  coverage(expression, instance).uncovered.map((finding) => finding.path)

const placeholder = 'operator-failure'
const divide = { $divide: ['$data.a', '$data.b'] }

test('the subpath exports fallbackCoverage alone, and its types from the root', () => {
  expect(Object.keys(authoring)).toEqual(['fallbackCoverage'])
  const options: FallbackCoverageOptions = { timeout: 50, numbers: 'strict' }
  const result: FallbackCoverage = fallbackCoverage(fig, 1, options)
  expect(result).toEqual({ uncovered: [], covered: [] })
})

test('a finding carries its code, certainty, operator and message', () => {
  const [finding] = fallbackCoverage(fig, divide).uncovered
  expect(finding).toEqual({
    path: [],
    code: placeholder,
    message: expect.stringContaining('placeholder'),
    certainty: 'may',
    operator: 'divide',
  })
})

test('numbers is accepted', () => {
  expect(fallbackCoverage(fig, divide, { numbers: 'ordinary' })).toEqual(
    fallbackCoverage(fig, divide)
  )
})

describe('where a finding sits', () => {
  test.each([
    ['a constant root', { plain: ['data', { nested: true }] }, []],
    ['an operator root', { $plus: [1, 2] }, [[]]],
    [
      'each node of plain data, by its own path',
      { a: divide, b: { $not: '$data.y' } },
      [['a'], ['b']],
    ],
    [
      'every node down a chain, each where it starts',
      { $upper: { $trim: { $lower: '$data.s' } } },
      [[], ['$upper'], ['$upper', '$trim']],
    ],
    ['a reference, which cannot throw without strictDataPaths', { a: '$data.x' }, []],
  ])('%s', (_label, expression, expected) => {
    expect(uncovered(expression)).toEqual(expected)
  })
})

describe('a fallback covers everything under it', () => {
  test('a root fallback covers the root and every node below it', () => {
    expect(coverage({ $upper: { $trim: '$data.s' }, fallback: '' })).toEqual({
      uncovered: [],
      covered: [
        { path: [], code: placeholder, by: [] },
        { path: ['$upper'], code: placeholder, by: [] },
      ],
    })
  })

  test('the nearest fallback is the one that covers', () => {
    expect(coverage({ $upper: { $trim: '$data.s', fallback: 'x' }, fallback: '' }).covered).toEqual(
      [
        { path: [], code: placeholder, by: [] },
        { path: ['$upper'], code: placeholder, by: ['$upper'] },
      ]
    )
  })

  test('an inner fallback leaves the node above it uncovered', () => {
    expect(
      coverage({ greeting: { $buildString: ['Hi %1', { $upper: '$data.n', fallback: 'there' }] } })
    ).toEqual({
      uncovered: [{ path: ['greeting'], code: placeholder }],
      covered: [
        {
          path: ['greeting', '$buildString', 1],
          code: placeholder,
          by: ['greeting', '$buildString', 1],
        },
      ],
    })
  })

  test('adding a fallback at each uncovered node covers the expression', () => {
    const before = { a: divide, b: { $not: '$data.y' }, c: '$data.z' }
    expect(uncovered(before)).toEqual([['a'], ['b']])
    const after = { ...before, a: { ...divide, fallback: 0 }, b: { ...before.b, fallback: false } }
    expect(uncovered(after)).toEqual([])
  })
})

describe("a fallback's own failures escape its node", () => {
  test.each([
    ['a constant', 'n/a', []],
    ['null', null, []],
    ['a reference', '$data.backup', []],
    ['plain data holding only references', { from: '$data.backup' }, []],
    ['an operator node', { $get: 'backup' }, [['fallback']]],
    ['an operator node with a fallback of its own', { $get: 'backup', fallback: null }, []],
    ['plain data holding an operator node', { from: { $get: 'backup' } }, [['fallback', 'from']]],
  ])('%s', (_label, fallback, expected) => {
    const result = coverage({ ...divide, fallback })
    expect(result.uncovered.map((finding) => finding.path)).toEqual(expected)
    expect(result.covered).toContainEqual({ path: [], code: placeholder, by: [] })
  })
})

describe('an operatorDefaults fallback', () => {
  test('covers a node with none of its own, as a value never evaluated', () => {
    const withDefault = new FigTree({ operatorDefaults: { divide: { fallback: 0 } } })
    expect(coverage({ a: divide }, withDefault)).toEqual({
      uncovered: [],
      covered: [{ path: ['a'], code: placeholder, by: ['a'] }],
    })
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
      'a var defined by an uncovered node, reported at its definition',
      { vars: { total: { $plus: ['$data.a', 1] } }, t: '$vars.total' },
      [['vars', 'total']],
    ],
    [
      'a var defined by a covered node',
      { vars: { total: { $plus: ['$data.a', 1], fallback: 0 } }, t: '$vars.total' },
      [],
    ],
    [
      'a var through another var',
      { vars: { a: { $upper: '$data.s' }, b: '$vars.a' }, t: '$vars.b' },
      [['vars', 'a']],
    ],
    [
      'a var nothing references is never evaluated',
      { vars: { a: { $upper: '$data.s' } }, t: 1 },
      [],
    ],
    [
      'a nested plain object with vars',
      { section: { vars: { x: '$data.x' }, a: '$vars.x', b: { $upper: 'x' } } },
      [['section', 'b']],
    ],
  ])('%s', (_label, expression, expected) => {
    expect(uncovered(expression)).toEqual(expected)
  })

  test('a var read twice is reported once', () => {
    const expression = {
      $plus: [{ $upper: '$vars.n' }, { $trim: '$vars.n' }],
      vars: { n: { $lower: '$data.s' } },
    }
    expect(uncovered(expression).filter((path) => path[0] === 'vars')).toEqual([['vars', 'n']])
  })

  test('a var is covered by the fallback above each place it is read', () => {
    const expression = {
      $plus: [{ $upper: '$vars.n', fallback: 'u' }, { $trim: '$vars.n' }],
      vars: { n: { $lower: '$data.s' } },
    }
    const result = coverage(expression)
    expect(result.uncovered).toContainEqual({ path: ['vars', 'n'], code: placeholder })
    expect(result.covered).toContainEqual({
      path: ['vars', 'n'],
      code: placeholder,
      by: ['$plus', 0],
    })
  })

  test("a node's own vars are in scope for its fallback", () => {
    const expression = {
      a: { vars: { v: { $upper: '$data.s' } }, $lower: '$data.t', fallback: '$vars.v' },
    }
    expect(coverage(expression)).toEqual({
      uncovered: [{ path: ['a', 'vars', 'v'], code: placeholder }],
      covered: [{ path: ['a'], code: placeholder, by: ['a'] }],
    })
  })
})

describe('strictDataPaths', () => {
  const strict = new FigTree({ strictDataPaths: true })

  test('a reference that drills may throw, a bare namespace may not', () => {
    expect(coverage({ a: '$data.x', b: '$data' }, strict).uncovered).toEqual([
      { path: ['a'], code: ErrorCodes.missingDataPath },
    ])
    expect(uncovered({ a: '$data.x', b: '$data' })).toEqual([])
  })

  test('a reference fallback that drills does not cover', () => {
    expect(coverage({ ...divide, fallback: '$data.backup' }, strict).uncovered).toEqual([
      { path: ['fallback'], code: ErrorCodes.missingDataPath },
    ])
  })

  test('a var drilled past its name may throw, the var itself may not', () => {
    const vars = { user: '$data' }
    expect(uncovered({ vars, a: '$vars.user', b: '$vars.user.name' }, strict)).toEqual([['b']])
  })

  test('$element drills, $index never does', () => {
    const expression = { $map: { input: [], each: ['$element.x', '$index'] } }
    expect(uncovered(expression, strict)).toEqual([[], ['$map', 'each', 0]])
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
      plain: { expression: { a: '$params.x' }, parameters: { x: { type: 'number' } } },
      needs: {
        expression: { $not: '$params.x' },
        parameters: { x: { type: 'any', required: true } },
      },
      outer: { expression: { $echo: { s: { $lower: '$data.s' } } } },
    },
  })
  const calls = (expression: unknown) => coverage(expression, withFragments)
  const body = ['expression']

  test('a failure in the body is reported at the call, with its place in the body', () => {
    expect(calls({ a: { $unsafe: {} } })).toEqual({
      uncovered: [{ path: ['a'], code: placeholder, fragment: 'unsafe', fragmentPath: body }],
      covered: [],
    })
  })

  test('a call takes its own fallback', () => {
    expect(calls({ a: { $unsafe: {}, fallback: 0 } })).toEqual({
      uncovered: [],
      covered: [
        { path: ['a'], code: placeholder, fragment: 'unsafe', fragmentPath: body, by: ['a'] },
      ],
    })
  })

  test('a fallback in the body covers at the call, with its place in the body', () => {
    expect(calls({ a: { $safe: {} } })).toEqual({
      uncovered: [],
      covered: [
        {
          path: ['a'],
          code: placeholder,
          fragment: 'safe',
          fragmentPath: body,
          by: ['a'],
          byFragmentPath: body,
        },
      ],
    })
    expect(calls({ a: { $card: {} } }).uncovered).toEqual([])
  })

  test('a constant argument cannot fail', () => {
    expect(calls({ a: { $echo: { s: 'x' } } }).uncovered).toEqual([])
  })

  test("a computed argument fails where the body reads it, so the body's fallbacks catch it", () => {
    // Read under the root's fallback, then again by that fallback itself
    expect(calls({ a: { $echo: { s: '$data.s' } } })).toEqual({
      uncovered: [{ path: ['a', '$echo', 's'], code: ErrorCodes.typeCheck }],
      covered: [
        {
          path: ['a'],
          code: placeholder,
          fragment: 'echo',
          fragmentPath: body,
          by: ['a'],
          byFragmentPath: body,
        },
        { path: ['a', '$echo', 's'], code: ErrorCodes.typeCheck, by: ['a'], byFragmentPath: body },
      ],
    })
  })

  test('an argument the body reads outside any fallback escapes the call', () => {
    expect(calls({ a: { $plain: { x: { $plus: ['$data.n', 1] } } } }).uncovered).toEqual([
      { path: ['a', '$plain', 'x'], code: ErrorCodes.typeCheck },
      { path: ['a', '$plain', 'x'], code: placeholder },
    ])
  })

  test('an argument the body never reads is never evaluated', () => {
    expect(calls({ a: { $safe: {} }, b: { $plain: {} } }).uncovered).toEqual([])
  })

  test('an argument written in a body is reported at the outer call', () => {
    const result = calls({ a: { $outer: {} } })
    expect(result.uncovered).toEqual([
      {
        path: ['a'],
        code: ErrorCodes.typeCheck,
        fragment: 'outer',
        fragmentPath: ['expression', '$echo', 's'],
      },
      {
        path: ['a'],
        code: placeholder,
        fragment: 'outer',
        fragmentPath: ['expression', '$echo', 's'],
      },
    ])
    expect(result.covered).toContainEqual({
      path: ['a'],
      code: placeholder,
      fragment: 'echo',
      fragmentPath: body,
      by: ['a'],
      byFragmentPath: body,
    })
  })

  test('dynamic arguments are checked before the body runs, outside its fallbacks', () => {
    expect(calls({ a: { fragment: 'safe', parameters: '$data.args' } }).uncovered).toEqual([
      { path: ['a', 'parameters'], code: ErrorCodes.typeCheck },
    ])
    expect(calls({ a: { fragment: 'needs', parameters: '$data.args' } }).uncovered).toEqual([
      { path: ['a'], code: placeholder, fragment: 'needs', fragmentPath: body },
      { path: ['a', 'parameters'], code: ErrorCodes.typeCheck },
      { path: ['a', 'parameters'], code: ErrorCodes.missingRequired },
    ])
  })

  test('a call to an unknown fragment always fails', () => {
    expect(fallbackCoverage(withFragments, { a: { fragment: 'nope' } }).uncovered).toEqual([
      expect.objectContaining({
        path: ['a'],
        code: ErrorCodes.unknownFragment,
        certainty: 'always',
      }),
    ])
  })
})

test('an invalid node always fails, with its static error', () => {
  expect(fallbackCoverage(fig, { a: { operator: 'plus', fragment: 'f' }, b: 1 }).uncovered).toEqual(
    [expect.objectContaining({ path: ['a'], code: ErrorCodes.malformedNode, certainty: 'always' })]
  )
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
