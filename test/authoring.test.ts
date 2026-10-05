/**
 * The `./authoring` surface and `fallbackCoverage` without a timeout
 * (docs-dev/v3-specs/v3-fallback-coverage.md). The timeout rule has its own
 * suite, test/authoring-timeout.test.ts, and the case corpus with the
 * soundness check is test/coverage-cases.test.ts.
 *
 * Every operator node carries one placeholder finding until the operators'
 * failure rules land. The tests of where findings sit and which fallback
 * covers them give their operators constant inputs, so that the
 * placeholders are all they report; type checks between nodes have their
 * own section.
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
  ...(finding.parameter !== undefined ? { parameter: finding.parameter } : {}),
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
const divide = { $divide: [6, 3] }

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
      { $upper: { $trim: { $lower: 'S' } } },
      [[], ['$upper'], ['$upper', '$trim']],
    ],
    ['a reference, which cannot throw without strictDataPaths', { a: '$data.x' }, []],
  ])('%s', (_label, expression, expected) => {
    expect(uncovered(expression)).toEqual(expected)
  })
})

describe('a fallback covers everything under it', () => {
  test('a root fallback covers the root and every node below it', () => {
    expect(coverage({ $upper: { $trim: ' s ' }, fallback: '' })).toEqual({
      uncovered: [],
      covered: [
        { path: [], code: placeholder, by: [] },
        { path: ['$upper'], code: placeholder, by: [] },
      ],
    })
  })

  test('the nearest fallback is the one that covers', () => {
    expect(coverage({ $upper: { $trim: ' s ', fallback: 'x' }, fallback: '' }).covered).toEqual([
      { path: [], code: placeholder, by: [] },
      { path: ['$upper'], code: placeholder, by: ['$upper'] },
    ])
  })

  test('an inner fallback leaves the node above it uncovered', () => {
    expect(
      coverage({ greeting: { $buildString: ['Hi %1', { $upper: 'n', fallback: 'there' }] } })
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
      { vars: { total: { $plus: [2, 1] } }, t: '$vars.total' },
      [['vars', 'total']],
    ],
    [
      'a var defined by a covered node',
      { vars: { total: { $plus: [2, 1], fallback: 0 } }, t: '$vars.total' },
      [],
    ],
    [
      'a var through another var',
      { vars: { a: { $upper: 's' }, b: '$vars.a' }, t: '$vars.b' },
      [['vars', 'a']],
    ],
    ['a var nothing references is never evaluated', { vars: { a: { $upper: 's' } }, t: 1 }, []],
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
      vars: { n: { $lower: 'S' } },
    }
    expect(uncovered(expression).filter((path) => path[0] === 'vars')).toEqual([['vars', 'n']])
  })

  test('a var is covered by the fallback above each place it is read', () => {
    const expression = {
      $plus: [{ $upper: '$vars.n', fallback: 'u' }, { $trim: '$vars.n' }],
      vars: { n: { $lower: 'S' } },
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
      a: { vars: { v: { $upper: 's' } }, $lower: 'T', fallback: '$vars.v' },
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

  test('$element drills into what an element can be, $index never drills', () => {
    const each = ['$element.x', '$index']
    expect(coverage({ $map: { input: [{ x: 1 }, { x: 2 }], each } }, strict).uncovered).toEqual([
      { path: [], code: placeholder },
    ])
    expect(coverage({ $map: { input: [{ x: 1 }, {}], each } }, strict).uncovered).toEqual([
      { path: [], code: placeholder },
      { path: ['$map', 'each', 0], code: ErrorCodes.missingDataPath },
    ])
  })
})

describe('fragment calls', () => {
  const withFragments = new FigTree({
    fragments: {
      safe: { expression: { $upper: 's', fallback: '$data.t' } },
      unsafe: { expression: { $upper: 's' } },
      echo: {
        expression: { $upper: '$params.s', fallback: '$params.s' },
        parameters: { s: { type: 'string' } },
      },
      card: { expression: { title: { $upper: 't', fallback: '' }, body: '$data.b' } },
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
      uncovered: [{ path: ['a', '$echo', 's'], code: ErrorCodes.typeCheck, parameter: 's' }],
      covered: [
        {
          path: ['a'],
          code: placeholder,
          fragment: 'echo',
          fragmentPath: body,
          by: ['a'],
          byFragmentPath: body,
        },
        {
          path: ['a', '$echo', 's'],
          code: ErrorCodes.typeCheck,
          parameter: 's',
          by: ['a'],
          byFragmentPath: body,
        },
      ],
    })
  })

  test('an argument the body reads outside any fallback escapes the call', () => {
    expect(calls({ a: { $plain: { x: { $plus: ['$data.n', 1] } } } }).uncovered).toEqual([
      { path: ['a', '$plain', 'x'], code: ErrorCodes.typeCheck, parameter: 'x' },
      { path: ['a', '$plain', 'x'], code: placeholder },
      { path: ['a', '$plain', 'x'], code: ErrorCodes.typeCheck, parameter: 'values' },
    ])
  })

  test('an argument the body never reads is never evaluated', () => {
    expect(calls({ a: { $safe: {} }, b: { $plain: {} } }).uncovered).toEqual([])
  })

  test('an argument written in a body is reported at the outer call', () => {
    const result = calls({ a: { $outer: {} } })
    const at = { path: ['a'], fragment: 'outer', fragmentPath: ['expression', '$echo', 's'] }
    // lower may return null, which echo's required `s` refuses
    expect(result.uncovered).toEqual([
      { ...at, code: ErrorCodes.typeCheck, parameter: 's' },
      { ...at, code: placeholder },
      { ...at, code: ErrorCodes.typeCheck, parameter: 'value' },
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

describe('type checks between nodes', () => {
  /** The findings beside the placeholders, with their certainty. */
  const checks = (expression: unknown, instance: FigTree = fig) => {
    const { uncovered, covered } = fallbackCoverage(instance, expression)
    const shown = (finding: CoverageFinding | CoveredFinding) => ({
      ...where(finding),
      certainty: finding.certainty,
    })
    return {
      uncovered: uncovered.filter((f) => f.code !== placeholder).map(shown),
      covered: covered.filter((f) => f.code !== placeholder).map(shown),
    }
  }
  const typeCheck = (path: (string | number)[], parameter: string, certainty = 'may') => ({
    path,
    code: ErrorCodes.typeCheck,
    parameter,
    certainty,
  })

  test('untyped data may fail a typed parameter, never an any one', () => {
    expect(checks({ $lower: '$data.s' }).uncovered).toEqual([typeCheck([], 'value')])
    expect(checks({ $not: '$data.x' }).uncovered).toEqual([])
  })

  test("a child's declared returns that fit pass, and a fallback widens them", () => {
    expect(checks({ $upper: { $trim: 'x' } }).uncovered).toEqual([])
    expect(checks({ $multiply: [{ $length: 'abc', fallback: 'none' }, 2] }).uncovered).toEqual([
      typeCheck([], 'values'),
    ])
  })

  test('a value that can never fit fails whenever the node is reached', () => {
    const expression = { $map: { input: [1, 2], each: { $upper: '$element' } } }
    expect(checks(expression).uncovered).toEqual([typeCheck(['$map', 'each'], 'value', 'always')])
  })

  test('a null at an optional parameter takes its default', () => {
    const expression = { $split: ['a,b', { $lower: '$data.d', fallback: ',' }] }
    expect(checks(expression)).toEqual({
      uncovered: [],
      covered: [{ ...typeCheck(['$split', 1], 'value'), by: ['$split', 1] }],
    })
  })

  test('a propagated null meets a parameter that refuses it, unless a default absorbs it', () => {
    const input = { $split: [{ $lower: 'S' }, ','] }
    expect(checks({ $map: { input, each: '$element' } }).uncovered).toEqual([])
    const nullable = { $split: [{ $get: 's', fallback: null }, ','] }
    expect(checks({ $map: { input: nullable, each: '$element' } }).uncovered).toEqual([
      typeCheck([], 'input'),
      typeCheck(['$map', 'input'], 'value'),
    ])
    expect(
      checks({ $map: { input: nullable, nullInputDefault: [], each: '$element' } }).uncovered
    ).toEqual([typeCheck(['$map', 'input'], 'value')])
  })

  test('$element is what an element can be, and $index an integer', () => {
    const words = { $map: { input: ['a', 'b'], each: { $upper: '$element' } } }
    expect(checks(words).uncovered).toEqual([])
    const renamed = { $map: { input: ['a', 'b'], as: 'word', each: { $upper: '$word' } } }
    expect(checks(renamed).uncovered).toEqual([])
    const places = { $map: { input: [1.25, 2.5], each: { $round: [1.5, '$index'] } } }
    expect(checks(places).uncovered).toEqual([])
  })

  test("a var's reference is what its definition returns", () => {
    expect(checks({ $multiply: ['$vars.n', 2], vars: { n: 3 } }).uncovered).toEqual([])
    expect(checks({ $multiply: ['$vars.n', 2], vars: { n: 'x' } }).uncovered).toEqual([
      typeCheck([], 'values', 'always'),
    ])
  })

  test('a drill into a known value finds what is there, under strictDataPaths too', () => {
    const strict = new FigTree({ strictDataPaths: true })
    const vars = { o: { a: 1 } }
    expect(checks({ $plus: ['$vars.o.a', 1], vars }, strict).uncovered).toEqual([])
    expect(checks({ $plus: ['$vars.o.b', 1], vars }, strict).uncovered).toEqual([
      { path: ['$plus', 0], code: ErrorCodes.missingDataPath, certainty: 'always' },
    ])
  })

  describe('a fragment body, per call', () => {
    const withFragments = new FigTree({
      fragments: {
        double: {
          expression: { $multiply: ['$params.n', 2] },
          parameters: { n: { type: 'number' } },
        },
        label: {
          expression: { $upper: '$params.s' },
          parameters: { s: { type: 'string', default: 'none' } },
        },
      },
    })
    const calls = (expression: unknown) => checks(expression, withFragments)

    test('a parameter is what its argument passes as', () => {
      expect(calls({ $double: { n: 3 } }).uncovered).toEqual([])
      // The argument is checked at the call; the body then reads a number
      expect(calls({ $double: { n: '$data.x' } }).uncovered).toEqual([
        typeCheck(['$double', 'n'], 'n'),
      ])
    })

    test('an optional parameter with no argument is its default', () => {
      expect(calls({ $label: {} }).uncovered).toEqual([])
      // A string or null, and a null takes the default
      expect(calls({ $label: { s: { $lower: 'S', fallback: null } } }).uncovered).toEqual([])
      // `get` returns anything, which the declaration may refuse
      expect(calls({ $label: { s: { $get: 's' } } }).uncovered).toEqual([
        typeCheck(['$label', 's'], 's'),
      ])
    })

    test('a dynamic call reads the declarations', () => {
      expect(calls({ fragment: 'double', parameters: '$data.args' }).uncovered).toEqual([
        { path: ['parameters'], code: ErrorCodes.typeCheck, certainty: 'may' },
        { path: ['parameters'], code: ErrorCodes.missingRequired, certainty: 'may' },
      ])
    })
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
