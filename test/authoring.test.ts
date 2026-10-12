/**
 * The `./authoring` surface and `fallbackCoverage` without a timeout
 * (docs-dev/v3-specs/v3-fallback-coverage.md). The timeout rule has its own
 * suite, test/authoring-timeout.test.ts; the case corpus with the soundness
 * check is test/coverage-cases.test.ts, and the core failure rules are
 * checked against the engine in test/coverage-rules.test.ts.
 *
 * The tests of where findings sit and which fallback covers them use
 * `risky`, a host operator that declares no `analysis`, so is external: it
 * gives one `operator-failure` wherever it is, and nothing else.
 *
 * The subpath's types export from the root. test/exports.test.ts lists
 * values only, so they are checked here, where `pnpm typecheck` fails if one
 * goes missing.
 */
import { ErrorCodes, FigTree, OperatorFailure, coreOperators, defineOperator } from '../src'
import type {
  CoverageFinding,
  FailureTest,
  CoveredFinding,
  FailureRule,
  FallbackCoverage,
  FallbackCoverageOptions,
  FigTreeOptions,
  OperatorAnalysis,
} from '../src'
import * as authoring from '../src/authoring'
import { fallbackCoverage } from '../src/authoring'

const risky = defineOperator({
  name: 'risky',
  category: 'other',
  parameters: { value: {} },
  positionalParams: ['value'],
  evaluate: ({ value }) => value,
})
const withRisky = (options: FigTreeOptions = {}) =>
  new FigTree({ ...options, operators: [coreOperators, [risky]] })
const fig = withRisky()

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

const coverage = async (expression: unknown, instance: FigTree = fig) => {
  const { uncovered, covered } = await fallbackCoverage(instance, expression)
  return { uncovered: uncovered.map(where), covered: covered.map(where) }
}
const uncovered = async (expression: unknown, instance: FigTree = fig) =>
  (await coverage(expression, instance)).uncovered.map((finding) => finding.path)

/** What an external node gives */
const external = 'operator-failure'
const node = { $risky: 1 }

test('the subpath exports fallbackCoverage alone, and its types from the root', async () => {
  expect(Object.keys(authoring)).toEqual(['fallbackCoverage'])
  const options: FallbackCoverageOptions = { strictNumbers: true }
  const result: FallbackCoverage = await fallbackCoverage(fig, 1, options)
  expect(result).toEqual({ uncovered: [], covered: [] })
  const test: FailureTest = { not: { below: 0 } }
  const rule: FailureRule = { code: 'operator-failure', when: { value: test } }
  const declared: OperatorAnalysis = { failures: [rule] }
  expect(declared.failures).toHaveLength(1)
})

test('a finding carries its code, certainty, operator, parameter and message', async () => {
  expect((await fallbackCoverage(fig, { $divide: [1, 0] })).uncovered).toEqual([
    {
      path: [],
      code: ErrorCodes.nonFiniteResult,
      message: 'divide – produced a non-finite number (Infinity)',
      certainty: 'always',
      operator: 'divide',
      parameter: 'by',
    },
  ])
})

describe('strictNumbers', () => {
  const sum = {
    $plus: [
      { $length: '$data.a', fallback: 0 },
      { $length: '$data.b', fallback: 0 },
    ],
  }

  test('counts overflow on numbers the walk cannot pin down, which is off by default', async () => {
    expect((await fallbackCoverage(fig, sum)).uncovered).toEqual([])
    expect((await fallbackCoverage(fig, sum, { strictNumbers: false })).uncovered).toEqual([])
    expect(
      (await fallbackCoverage(fig, sum, { strictNumbers: true })).uncovered.map(
        (finding) => finding.code
      )
    ).toEqual([ErrorCodes.nonFiniteResult])
  })

  test('an overflow is never certain, so the node above it still checks its inputs', async () => {
    // Never null, so only the overflow could end subtract; with x 'a' it
    // gives 0, and divide fails
    const count = { $length: { $buildString: ['%1', '$data.x'] } }
    const ratio = { $divide: [1, { $subtract: [count, 1] }] }
    const { uncovered } = await fallbackCoverage(fig, ratio, { strictNumbers: true })
    expect(
      uncovered.map((finding) => ({ ...where(finding), certainty: finding.certainty }))
    ).toEqual([
      { path: [], code: ErrorCodes.nonFiniteResult, parameter: 'by', certainty: 'may' },
      { path: [], code: ErrorCodes.nonFiniteResult, certainty: 'may' },
      { path: ['$divide', 1], code: ErrorCodes.nonFiniteResult, certainty: 'may' },
    ])
  })

  test('anything but a boolean is refused', async () => {
    await expect(
      fallbackCoverage(fig, 1, { strictNumbers: 'yes' as unknown as boolean })
    ).rejects.toThrow(expect.objectContaining({ code: ErrorCodes.invalidOptions }))
  })
})

describe('where a finding sits', () => {
  test.each([
    ['a constant root', { plain: ['data', { nested: true }] }, []],
    ['an operator root', node, [[]]],
    ['an operator that cannot fail here', { $plus: [1, 2] }, []],
    [
      'each node of plain data, by its own path',
      { a: node, b: { $risky: '$data.y' } },
      [['a'], ['b']],
    ],
    [
      'every node down a chain, each where it starts',
      { $risky: { $risky: { $risky: 'S' } } },
      [[], ['$risky'], ['$risky', '$risky']],
    ],
    ['a reference, which cannot throw without strictDataPaths', { a: '$data.x' }, []],
  ])('%s', async (_label, expression, expected) => {
    expect(await uncovered(expression)).toEqual(expected)
  })
})

describe('a fallback covers everything under it', () => {
  test('a root fallback covers the root and every node below it', async () => {
    expect(await coverage({ $risky: { $risky: ' s ' }, fallback: '' })).toEqual({
      uncovered: [],
      covered: [
        { path: [], code: external, by: [] },
        { path: ['$risky'], code: external, by: [] },
      ],
    })
  })

  test('the nearest fallback is the one that covers', async () => {
    expect(
      (await coverage({ $risky: { $risky: ' s ', fallback: 'x' }, fallback: '' })).covered
    ).toEqual([
      { path: [], code: external, by: [] },
      { path: ['$risky'], code: external, by: ['$risky'] },
    ])
  })

  test('an inner fallback leaves the node above it uncovered', async () => {
    expect(await coverage({ greeting: { $risky: { $risky: 'n', fallback: 'there' } } })).toEqual({
      uncovered: [{ path: ['greeting'], code: external }],
      covered: [{ path: ['greeting', '$risky'], code: external, by: ['greeting', '$risky'] }],
    })
  })

  test('an inner fallback is enough where the node above it cannot fail', async () => {
    const greeting = { $buildString: ['Hi %1', { $risky: '$data.n', fallback: 'there' }] }
    expect(await coverage({ greeting })).toEqual({
      uncovered: [],
      covered: [
        {
          path: ['greeting', '$buildString', 1],
          code: external,
          by: ['greeting', '$buildString', 1],
        },
      ],
    })
  })

  test('adding a fallback at each uncovered node covers the expression', async () => {
    const before = { a: node, b: { $risky: '$data.y' }, c: '$data.z' }
    expect(await uncovered(before)).toEqual([['a'], ['b']])
    const after = { ...before, a: { ...node, fallback: 0 }, b: { ...before.b, fallback: false } }
    expect(await uncovered(after)).toEqual([])
  })
})

describe("a fallback's own failures escape its node", () => {
  test.each([
    ['a constant', 'n/a', []],
    ['null', null, []],
    ['a reference', '$data.backup', []],
    ['plain data holding only references', { from: '$data.backup' }, []],
    ['an operator node', { $risky: 'backup' }, [['fallback']]],
    ['an operator node with a fallback of its own', { $risky: 'backup', fallback: null }, []],
    ['plain data holding an operator node', { from: { $risky: 'backup' } }, [['fallback', 'from']]],
  ])('%s', async (_label, fallback, expected) => {
    const result = await coverage({ ...node, fallback })
    expect(result.uncovered.map((finding) => finding.path)).toEqual(expected)
    expect(result.covered).toContainEqual({ path: [], code: external, by: [] })
  })
})

describe('an operatorDefaults fallback', () => {
  test('covers a node with none of its own, as a value never evaluated', async () => {
    const withDefault = withRisky({ operatorDefaults: { risky: { fallback: 0 } } })
    expect(await coverage({ a: node }, withDefault)).toEqual({
      uncovered: [],
      covered: [{ path: ['a'], code: external, by: ['a'] }],
    })
    // Returned as it is, so even a `$`-shaped string cannot throw
    const literal = withRisky({ operatorDefaults: { risky: { fallback: '$USD' } } })
    expect(await uncovered({ a: node }, literal)).toEqual([])
    // Another operator's default covers nothing here
    const other = withRisky({ operatorDefaults: { plus: { fallback: 0 } } })
    expect(await uncovered({ a: node }, other)).toEqual([['a']])
  })
})

describe('$vars references, through their definitions', () => {
  test.each([
    ['a var defined by a reference', { vars: { user: '$data.user' }, name: '$vars.user.name' }, []],
    [
      'a var defined by an uncovered node, reported at its definition',
      { vars: { total: { $risky: 2 } }, t: '$vars.total' },
      [['vars', 'total']],
    ],
    [
      'a var defined by a covered node',
      { vars: { total: { $risky: 2, fallback: 0 } }, t: '$vars.total' },
      [],
    ],
    [
      'a var through another var',
      { vars: { a: { $risky: 's' }, b: '$vars.a' }, t: '$vars.b' },
      [['vars', 'a']],
    ],
    ['a var nothing references is never evaluated', { vars: { a: { $risky: 's' } }, t: 1 }, []],
    [
      'a nested plain object with vars',
      { section: { vars: { x: '$data.x' }, a: '$vars.x', b: { $risky: 'x' } } },
      [['section', 'b']],
    ],
  ])('%s', async (_label, expression, expected) => {
    expect(await uncovered(expression)).toEqual(expected)
  })

  test('a var read twice is reported once', async () => {
    const expression = {
      operator: 'risky',
      value: [{ $risky: '$vars.n' }, { $risky: '$vars.n' }],
      vars: { n: { $risky: 'S' } },
    }
    expect((await uncovered(expression)).filter((path) => path[0] === 'vars')).toEqual([
      ['vars', 'n'],
    ])
  })

  test('a var is covered by the fallback above each place it is read', async () => {
    const expression = {
      operator: 'risky',
      value: [{ $risky: '$vars.n', fallback: 'u' }, { $risky: '$vars.n' }],
      vars: { n: { $risky: 'S' } },
    }
    const result = await coverage(expression)
    expect(result.uncovered).toContainEqual({ path: ['vars', 'n'], code: external })
    expect(result.covered).toContainEqual({
      path: ['vars', 'n'],
      code: external,
      by: ['value', 0],
    })
  })

  test("a node's own vars are in scope for its fallback", async () => {
    const expression = {
      a: { vars: { v: { $risky: 's' } }, $risky: 'T', fallback: '$vars.v' },
    }
    expect(await coverage(expression)).toEqual({
      uncovered: [{ path: ['a', 'vars', 'v'], code: external }],
      covered: [{ path: ['a'], code: external, by: ['a'] }],
    })
  })
})

describe('strictDataPaths', () => {
  const strict = withRisky({ strictDataPaths: true })

  test('a reference that drills may throw, a bare namespace may not', async () => {
    expect((await coverage({ a: '$data.x', b: '$data' }, strict)).uncovered).toEqual([
      { path: ['a'], code: ErrorCodes.missingDataPath },
    ])
    expect(await uncovered({ a: '$data.x', b: '$data' })).toEqual([])
  })

  test('a reference fallback that drills does not cover', async () => {
    expect((await coverage({ ...node, fallback: '$data.backup' }, strict)).uncovered).toEqual([
      { path: ['fallback'], code: ErrorCodes.missingDataPath },
    ])
  })

  test('a var drilled past its name may throw, the var itself may not', async () => {
    const vars = { user: '$data' }
    expect(await uncovered({ vars, a: '$vars.user', b: '$vars.user.name' }, strict)).toEqual([
      ['b'],
    ])
  })

  test('a bare $vars as get’s from is analysed as the drilled form it compiles to', async () => {
    const vars = { user: '$data.user' }
    const bare = { vars, a: { $get: { path: 'user.name', from: '$vars' } } }
    const drilled = { vars, a: { $get: { path: 'name', from: '$vars.user' } } }
    expect(await coverage(bare, strict)).toEqual(await coverage(drilled, strict))
    // The var's own read of `$data.user` may miss too; `default` covers
    // the get alone, as it does beside a drilled `from`
    expect(await uncovered(bare, strict)).toEqual([['vars', 'user'], ['a']])
    const defaulted = { vars, a: { $get: { ...bare.a.$get, default: null } } }
    expect(await uncovered(defaulted, strict)).toEqual([['vars', 'user']])
  })

  test('$element drills into what an element can be, $index never drills', async () => {
    const each = ['$element.x', '$index']
    expect(
      (await coverage({ $map: { input: [{ x: 1 }, { x: 2 }], each } }, strict)).uncovered
    ).toEqual([])
    expect((await coverage({ $map: { input: [{ x: 1 }, {}], each } }, strict)).uncovered).toEqual([
      { path: ['$map', 'each', 0], code: ErrorCodes.missingDataPath },
    ])
  })
})

describe('fragment calls', () => {
  const withFragments = withRisky({
    fragments: {
      safe: { expression: { $risky: 's', fallback: '$data.t' } },
      unsafe: { expression: { $risky: 's' } },
      echo: {
        expression: { $risky: '$params.s', fallback: '$params.s' },
        parameters: { s: { type: 'string' } },
      },
      card: { expression: { title: { $risky: 't', fallback: '' }, body: '$data.b' } },
      plain: { expression: { a: '$params.x' }, parameters: { x: { type: 'number' } } },
      unread: { expression: 'fixed', parameters: { x: { type: 'number' } } },
      needs: {
        expression: { $not: '$params.x' },
        parameters: { x: { type: 'any', required: true } },
      },
      outer: { expression: { $echo: { s: { $lower: '$data.s' } } } },
    },
  })
  const calls = async (expression: unknown) => await coverage(expression, withFragments)
  const body = ['expression']

  test('a failure in the body is reported at the call, with its place in the body', async () => {
    expect(await calls({ a: { $unsafe: {} } })).toEqual({
      uncovered: [{ path: ['a'], code: external, fragment: 'unsafe', fragmentPath: body }],
      covered: [],
    })
  })

  test('a call takes its own fallback', async () => {
    expect(await calls({ a: { $unsafe: {}, fallback: 0 } })).toEqual({
      uncovered: [],
      covered: [{ path: ['a'], code: external, fragment: 'unsafe', fragmentPath: body, by: ['a'] }],
    })
  })

  test('a fallback in the body covers at the call, with its place in the body', async () => {
    expect(await calls({ a: { $safe: {} } })).toEqual({
      uncovered: [],
      covered: [
        {
          path: ['a'],
          code: external,
          fragment: 'safe',
          fragmentPath: body,
          by: ['a'],
          byFragmentPath: body,
        },
      ],
    })
    expect((await calls({ a: { $card: {} } })).uncovered).toEqual([])
  })

  test('a constant argument cannot fail', async () => {
    expect((await calls({ a: { $echo: { s: 'x' } } })).uncovered).toEqual([])
  })

  test("a computed argument fails where the body reads it, so the body's fallbacks catch it", async () => {
    // Read under the root's fallback, then again by that fallback itself
    expect(await calls({ a: { $echo: { s: '$data.s' } } })).toEqual({
      uncovered: [{ path: ['a', '$echo', 's'], code: ErrorCodes.typeCheck, parameter: 's' }],
      covered: [
        {
          path: ['a'],
          code: external,
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

  test('an argument the body reads outside any fallback escapes the call', async () => {
    expect((await calls({ a: { $plain: { x: { $plus: ['$data.n', 1] } } } })).uncovered).toEqual([
      { path: ['a', '$plain', 'x'], code: ErrorCodes.typeCheck, parameter: 'x' },
      { path: ['a', '$plain', 'x'], code: ErrorCodes.typeCheck, parameter: 'values' },
    ])
  })

  test('an argument the body never reads is never evaluated', async () => {
    // The argument would fail as it does at `plain`, were it evaluated
    expect((await calls({ a: { $unread: { x: { $plus: ['$data.n', 1] } } } })).uncovered).toEqual(
      []
    )
  })

  test('an argument written in a body is reported at the outer call', async () => {
    const result = await calls({ a: { $outer: {} } })
    const at = { path: ['a'], fragment: 'outer', fragmentPath: ['expression', '$echo', 's'] }
    // lower may return null, which echo's required `s` refuses
    expect(result.uncovered).toEqual([
      { ...at, code: ErrorCodes.typeCheck, parameter: 's' },
      { ...at, code: ErrorCodes.typeCheck, parameter: 'value' },
    ])
    expect(result.covered).toContainEqual({
      path: ['a'],
      code: external,
      fragment: 'echo',
      fragmentPath: body,
      by: ['a'],
      byFragmentPath: body,
    })
  })

  test('dynamic arguments are checked before the body runs, outside its fallbacks', async () => {
    expect((await calls({ a: { fragment: 'safe', parameters: '$data.args' } })).uncovered).toEqual([
      { path: ['a', 'parameters'], code: ErrorCodes.typeCheck },
    ])
    expect((await calls({ a: { fragment: 'needs', parameters: '$data.args' } })).uncovered).toEqual(
      [
        { path: ['a', 'parameters'], code: ErrorCodes.typeCheck },
        { path: ['a', 'parameters'], code: ErrorCodes.missingRequired },
      ]
    )
  })

  test('a call to an unknown fragment always fails', async () => {
    expect((await fallbackCoverage(withFragments, { a: { fragment: 'nope' } })).uncovered).toEqual([
      expect.objectContaining({
        path: ['a'],
        code: ErrorCodes.unknownFragment,
        certainty: 'always',
      }),
    ])
  })
})

describe('type checks between nodes', () => {
  /** The findings with their certainty. */
  const checks = async (expression: unknown, instance: FigTree = fig) => {
    const { uncovered, covered } = await fallbackCoverage(instance, expression)
    const shown = (finding: CoverageFinding | CoveredFinding) => ({
      ...where(finding),
      certainty: finding.certainty,
    })
    return { uncovered: uncovered.map(shown), covered: covered.map(shown) }
  }
  const typeCheck = (path: (string | number)[], parameter: string, certainty = 'may') => ({
    path,
    code: ErrorCodes.typeCheck,
    parameter,
    certainty,
  })

  test('untyped data may fail a typed parameter, never an any one', async () => {
    expect((await checks({ $lower: '$data.s' })).uncovered).toEqual([typeCheck([], 'value')])
    expect((await checks({ $not: '$data.x' })).uncovered).toEqual([])
  })

  test("a child's declared returns that fit pass, and a fallback widens them", async () => {
    expect((await checks({ $upper: { $trim: 'x' } })).uncovered).toEqual([])
    expect(
      (await checks({ $multiply: [{ $length: '$data.s', fallback: 'none' }, 2] })).uncovered
    ).toEqual([typeCheck([], 'values')])
  })

  test('a value that can never fit fails whenever the node is reached', async () => {
    const expression = { $map: { input: [1, 2], each: { $upper: '$element' } } }
    expect((await checks(expression)).uncovered).toEqual([
      typeCheck(['$map', 'each'], 'value', 'always'),
    ])
  })

  test('a null at an optional parameter takes its default', async () => {
    const expression = { $split: ['a,b', { $lower: '$data.d', fallback: ',' }] }
    expect(await checks(expression)).toEqual({
      uncovered: [],
      covered: [{ ...typeCheck(['$split', 1], 'value'), by: ['$split', 1] }],
    })
  })

  test('a propagated null meets a parameter that refuses it, unless a default absorbs it', async () => {
    const input = { $split: [{ $lower: 'S' }, ','] }
    expect((await checks({ $map: { input, each: '$element' } })).uncovered).toEqual([])
    const nullable = { $split: [{ $get: 's', fallback: null }, ','] }
    expect((await checks({ $map: { input: nullable, each: '$element' } })).uncovered).toEqual([
      typeCheck([], 'input'),
      typeCheck(['$map', 'input'], 'value'),
    ])
    expect(
      (await checks({ $map: { input: nullable, nullInputDefault: [], each: '$element' } }))
        .uncovered
    ).toEqual([typeCheck(['$map', 'input'], 'value')])
  })

  test('$element is what an element can be, and $index an integer', async () => {
    const words = { $map: { input: ['a', 'b'], each: { $upper: '$element' } } }
    expect((await checks(words)).uncovered).toEqual([])
    const renamed = { $map: { input: ['a', 'b'], as: 'word', each: { $upper: '$word' } } }
    expect((await checks(renamed)).uncovered).toEqual([])
    const places = { $map: { input: [1.25, 2.5], each: { $plus: ['$index', 1] } } }
    expect((await checks(places)).uncovered).toEqual([])
  })

  test("a var's reference is what its definition returns", async () => {
    expect((await checks({ $multiply: ['$vars.n', 2], vars: { n: 3 } })).uncovered).toEqual([])
    expect((await checks({ $multiply: ['$vars.n', 2], vars: { n: 'x' } })).uncovered).toEqual([
      typeCheck([], 'values', 'always'),
    ])
  })

  test('a drill into a known value finds what is there, under strictDataPaths too', async () => {
    const strict = new FigTree({ strictDataPaths: true })
    const vars = { o: { a: 1 } }
    expect((await checks({ $plus: ['$vars.o.a', 1], vars }, strict)).uncovered).toEqual([])
    expect((await checks({ $plus: ['$vars.o.b', 1], vars }, strict)).uncovered).toEqual([
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
    const calls = async (expression: unknown) => await checks(expression, withFragments)

    test('a parameter is what its argument passes as', async () => {
      expect((await calls({ $double: { n: 3 } })).uncovered).toEqual([])
      // The argument is checked at the call; the body then reads a number
      expect((await calls({ $double: { n: '$data.x' } })).uncovered).toEqual([
        typeCheck(['$double', 'n'], 'n'),
      ])
    })

    test('an optional parameter with no argument is its default', async () => {
      expect((await calls({ $label: {} })).uncovered).toEqual([])
      // A string or null, and a null takes the default
      expect((await calls({ $label: { s: { $lower: 'S', fallback: null } } })).uncovered).toEqual(
        []
      )
      // `get` returns anything, which the declaration may refuse
      expect((await calls({ $label: { s: { $get: 's' } } })).uncovered).toEqual([
        typeCheck(['$label', 's'], 's'),
      ])
    })

    test('a dynamic call reads the declarations', async () => {
      expect((await calls({ fragment: 'double', parameters: '$data.args' })).uncovered).toEqual([
        { path: ['parameters'], code: ErrorCodes.typeCheck, certainty: 'may' },
        { path: ['parameters'], code: ErrorCodes.missingRequired, certainty: 'may' },
      ])
    })
  })
})

describe('what a node returns', () => {
  const findings = async (expression: unknown, options?: FallbackCoverageOptions) =>
    (await fallbackCoverage(fig, expression, options)).uncovered.map((finding) => ({
      ...where(finding),
      certainty: finding.certainty,
    }))
  const typeCheck = (path: (string | number)[], parameter: string) => ({
    path,
    code: ErrorCodes.typeCheck,
    parameter,
    certainty: 'may',
  })

  test.each([
    ['if: one of its branches', { $upper: { $if: ['$data.c', 'a', 'b'] } }],
    [
      'match: one of its branches or its default',
      { $upper: { $match: { value: 'k', branches: { k: 'x', j: 'y' }, default: 'z' } } },
    ],
    ['firstOf: stops at a candidate never null', { $upper: { $firstOf: ['a', '$data.x'] } }],
    ['min: one of its values', { $upper: { $min: ['a', 'b'] } }],
    ['split: an array of strings', { $join: { $split: ['a,b', ','] } }],
    [
      'convert: the type it converts to',
      { $plus: [{ $convert: ['$data.n', 'number'], fallback: 0 }, 1] },
    ],
    [
      'regex: by its mode',
      { $upper: { $regex: { value: 'abc', pattern: 'a+', mode: 'extract', noMatchDefault: '' } } },
    ],
    ['map: an array of what each element gives', { $join: { $map: { input: [1], each: 'x' } } }],
  ])('%s', async (_label, expression) => {
    expect((await findings(expression)).filter((finding) => finding.path.length === 0)).toEqual([])
  })

  test('firstOf past a candidate that may be null', async () => {
    expect(await findings({ $upper: { $firstOf: ['$data.x', 'a'] } })).toEqual([
      typeCheck([], 'value'),
    ])
  })

  test("plus is of its operands' kind, not one of them", async () => {
    // Six operands of two values each are too many combinations to run, and
    // their sum may be 0: the divisor is an integer, not -1 or 1
    const sign = { $if: ['$data.c', -1, 1] }
    const sum = { $plus: [sign, sign, sign, sign, sign, sign] }
    expect(await findings({ $divide: [10, sum] })).toEqual([
      { path: [], code: ErrorCodes.nonFiniteResult, parameter: 'by', certainty: 'may' },
    ])
  })

  test("a host operator's declared output", async () => {
    const echo = defineOperator({
      name: 'echo',
      category: 'other',
      parameters: { value: {} },
      positionalParams: ['value'],
      analysis: { failures: [], output: { param: 'value' } },
      evaluate: ({ value }) => value,
    })
    const hosts = new FigTree({ operators: [coreOperators, [echo]] })
    expect((await fallbackCoverage(hosts, { $upper: { $echo: 'x' } })).uncovered).toEqual([])
    expect(() =>
      defineOperator({
        name: 'bad',
        category: 'other',
        parameters: { value: {} },
        analysis: { output: { param: 'nope' } },
        evaluate: () => 1,
      })
    ).toThrow(expect.objectContaining({ code: ErrorCodes.invalidDefinition }))
  })

  describe('the result boundary, under strict numbers', () => {
    const strict = { strictNumbers: true }
    const nonFinite = { path: [], code: ErrorCodes.nonFiniteResult, certainty: 'may' }

    test('a number from the data may be NaN, wherever it is returned', async () => {
      const passed = { $if: ['$data.c', '$data.n', 0] }
      expect(await findings(passed, strict)).toEqual([nonFinite])
      expect(await findings(passed)).toEqual([])
      expect(await findings({ $floor: '$data.n' }, strict)).toEqual([
        typeCheck([], 'value'),
        nonFinite,
      ])
    })

    test('a number the walk knows, or one no NaN can reach, is never refused', async () => {
      expect(await findings({ $if: ['$data.c', 1, 2] }, strict)).toEqual([])
      expect(await findings({ $length: '$data.s' }, strict)).toEqual([typeCheck([], 'value')])
    })

    test('what passes the boundary is finite', async () => {
      // floor may be refused, but what it gives abs is a finite integer
      expect(
        (await findings({ $abs: { $floor: '$data.n', fallback: 0 } }, strict)).filter(
          (finding) => finding.path.length === 0
        )
      ).toEqual([])
    })
  })
})

describe('value ranges', () => {
  const findings = async (expression: unknown, instance: FigTree = fig) =>
    (await fallbackCoverage(instance, expression)).uncovered.map((finding) => ({
      ...where(finding),
      certainty: finding.certainty,
    }))
  /** A length, a non-negative integer the walk does not know */
  const length = { $length: '$data.s', fallback: 0 }
  /** A string the walk does not know */
  const text = { $buildString: ['%1', '$data.s'] }
  const byZero = { path: [], code: ErrorCodes.nonFiniteResult, parameter: 'by', certainty: 'may' }

  test.each([
    ['a length is never negative', { $power: [length, 0.5] }],
    ['a sum of lengths and 1 is never 0', { $divide: [10, { $plus: [length, 1] }] }],
    [
      'a product of factors from 1 up is never 0',
      { $divide: [10, { $multiply: [{ $plus: [length, 1] }, 2] }] },
    ],
    [
      'an absolute value is never negative',
      { $power: [{ $abs: { $subtract: [length, 5] } }, 0.5] },
    ],
    ['the greater of a length and 1 is at least 1', { $divide: [10, { $max: [length, 1] }] }],
    ['the lesser of a length and 4 is at most 4', { $round: [1.5, { $min: [length, 4] }] }],
    [
      '$index is never negative',
      { $map: { input: [1, 2], each: { $divide: [1, { $plus: ['$index', 1] }] } } },
    ],
  ])('%s', async (_label, expression) => {
    expect(await findings(expression)).toEqual([])
  })

  test('a difference of a length and 1 may be 0', async () => {
    expect(await findings({ $divide: [10, { $subtract: [length, 1] }] })).toEqual([byZero])
  })

  test('past the exact-value limit, numbers widen to the range they span', async () => {
    const branches = (from: number) =>
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, from + i]))
    const divisor = (from: number) => ({
      $divide: [1, { $match: { value: text, branches: branches(from), default: 50 } }],
    })
    expect(await findings(divisor(1))).toEqual([])
    expect(await findings(divisor(0))).toEqual([byZero])
  })

  describe("a host operator's declared range", () => {
    const values = { values: { type: 'array' as const } }
    const total = defineOperator({
      name: 'total',
      category: 'math',
      parameters: values,
      positionalParams: ['...values'],
      returns: 'number',
      analysis: { output: { sum: 'values' } },
      evaluate: ({ values }) => (values as number[]).reduce((sum, value) => sum + value, 0),
    })
    const word = defineOperator({
      name: 'word',
      category: 'string',
      parameters: { value: { type: 'string' } },
      positionalParams: ['value'],
      returns: 'string',
      analysis: { output: { type: 'string', minLength: 1 } },
      evaluate: ({ value }) => value || '-',
    })
    const picky = defineOperator({
      name: 'picky',
      category: 'string',
      parameters: { value: { type: 'string' } },
      positionalParams: ['value'],
      returns: 'string',
      analysis: { failures: [{ code: 'operator-failure', when: { value: { empty: true } } }] },
      evaluate: ({ value }) => {
        if (value === '') throw new OperatorFailure('nothing to pick')
        return value
      },
    })
    const hosts = new FigTree({ operators: [coreOperators, [total, word, picky]] })

    test('reaches the rules of the node it feeds', async () => {
      expect(await findings({ $picky: { $word: text } }, hosts)).toEqual([])
      expect(await findings({ $picky: text }, hosts)).toEqual([
        { path: [], code: ErrorCodes.operatorFailure, certainty: 'may' },
      ])
    })

    test('a sum over an array that may be empty may be 0', async () => {
      const ones = { $map: { input: '$data.list', nullInputDefault: [], each: 1 } }
      expect(await findings({ $divide: [1, { $total: ones }] }, hosts)).toEqual([
        { ...byZero, path: [] },
        {
          path: ['$divide', 1, '$total'],
          code: ErrorCodes.typeCheck,
          parameter: 'input',
          certainty: 'may',
        },
      ])
    })

    test('defineOperator() refuses a malformed range', () => {
      const declare = (output: unknown) => () =>
        defineOperator({
          name: 'ranged',
          category: 'math',
          parameters: { value: { type: 'number' }, values: { type: 'array' } },
          analysis: { output },
          evaluate: () => 1,
        } as unknown as Parameters<typeof defineOperator>[0])
      const refused = expect.objectContaining({ code: ErrorCodes.invalidDefinition })
      for (const output of [
        { type: 'integer', min: 0, max: 9 },
        { type: 'string', minLength: 1 },
        { arrayOf: 'string', minLength: 1 },
        { difference: ['value', 'value'] },
        { byParam: 'value', cases: { '': 'string' }, otherwise: { type: 'array', minLength: 1 } },
        { oneOf: [{ sum: 'values' }, { product: 'values' }, { abs: 'value' }] },
        { oneOf: [{ min: 'values' }, { max: 'values' }] },
      ])
        expect(declare(output)).not.toThrow()
      for (const output of [
        { type: 'integer', min: 'a' },
        { type: 'integer', min: 2, max: 1 },
        { type: 'number', max: Infinity },
        { type: 'integer', minLength: 1 },
        { type: 'string', min: 0 },
        { type: 'any', min: 0 },
        { type: 'array', minLength: -1 },
        { arrayOf: 'string', minLength: 0.5 },
        { difference: ['value'] },
        { difference: ['value', 'nope'] },
        { sum: 'nope' },
        { byParam: 'value', cases: {}, otherwise: { param: 'nope' } },
      ])
        expect(declare(output)).toThrow(refused)
    })
  })
})

describe("an operator's own failures", () => {
  const ownFindings = async (expression: unknown, instance: FigTree = fig) =>
    (await fallbackCoverage(instance, expression)).uncovered.map((finding) => ({
      ...where(finding),
      certainty: finding.certainty,
    }))

  test('a core rule answers from what its parameters receive', async () => {
    expect(await ownFindings({ $divide: [6, 3] })).toEqual([])
    expect(await ownFindings({ $divide: [6, { $length: '$data.s', fallback: 1 }] })).toEqual([
      { path: [], code: ErrorCodes.nonFiniteResult, parameter: 'by', certainty: 'may' },
    ])
    // A split on a delimiter always has a piece; a split into code points
    // has none where the string is empty
    const split = (delimiter: string) => ({
      $split: [{ $buildString: ['%1', '$data.s'] }, delimiter],
    })
    expect(await ownFindings({ $min: split(',') })).toEqual([])
    expect(await ownFindings({ $min: split('') })).toEqual([
      { path: [], code: ErrorCodes.emptyAggregate, parameter: 'values', certainty: 'may' },
    ])
  })

  test('a rule that needs an option counts only under it', async () => {
    expect(await ownFindings({ $get: 'a.b' })).toEqual([])
    expect(await ownFindings({ $get: 'a.b' }, withRisky({ strictDataPaths: true }))).toEqual([
      { path: [], code: ErrorCodes.missingDataPath, certainty: 'may' },
    ])
  })

  test('a validate hook decides a value once it is known', async () => {
    expect(await ownFindings({ $regex: ['$data.s', 'a+'] })).toEqual([
      { path: [], code: ErrorCodes.typeCheck, parameter: 'value', certainty: 'may' },
    ])
    // A pattern computed from the data is a string the hook has not seen
    const pattern = { $lower: '$data.p', fallback: 'a+' }
    expect(await ownFindings({ $regex: ['abc', pattern] })).toEqual([
      { path: [], code: ErrorCodes.operatorFailure, parameter: 'pattern', certainty: 'may' },
    ])
    expect(await ownFindings({ $regex: ['abc', '$vars.p'], vars: { p: 'a+' } })).toEqual([])
    expect(await ownFindings({ $regex: ['abc', '$vars.p'], vars: { p: 'a[' } })).toEqual([
      { path: [], code: ErrorCodes.operatorFailure, parameter: 'pattern', certainty: 'always' },
    ])
  })

  describe('host operators', () => {
    const base = {
      category: 'string' as const,
      parameters: { value: { type: 'string' as const } },
      positionalParams: ['value'],
      returns: 'string' as const,
      evaluate: ({ value }: { value: string }) => value,
    }
    const picky = defineOperator({
      ...base,
      name: 'picky',
      analysis: {
        failures: [{ code: 'operator-failure', parameter: 'value', when: { value: '' } }],
      },
      evaluate: ({ value }) => {
        if (value === '') throw new OperatorFailure('nothing to pick')
        return value
      },
    })
    const fetching = defineOperator({ ...base, name: 'fetching', analysis: { external: true } })
    const hosts = new FigTree({ operators: [coreOperators, [picky, fetching]] })

    test('a declared one fails only as its rules say', async () => {
      expect(await ownFindings({ $picky: 'x' }, hosts)).toEqual([])
      expect(await ownFindings({ $picky: '' }, hosts)).toEqual([
        { path: [], code: ErrorCodes.operatorFailure, parameter: 'value', certainty: 'always' },
      ])
    })

    test('an undeclared one, or one declared external, may fail whatever its inputs', async () => {
      expect(await ownFindings(node)).toEqual([{ path: [], code: external, certainty: 'may' }])
      expect(await ownFindings({ $fetching: 'x' }, hosts)).toEqual([
        { path: [], code: external, certainty: 'may' },
      ])
    })

    test('a host operator reusing a core name does not inherit its rules', async () => {
      const divide = defineOperator({ ...base, name: 'divide' })
      const own = new FigTree({ operators: [[divide]] })
      expect(await ownFindings({ $divide: 'x' }, own)).toEqual([
        { path: [], code: external, certainty: 'may' },
      ])
    })

    test('defineOperator() refuses a malformed analysis', () => {
      const refused = (analysis: unknown) =>
        expect(() =>
          defineOperator({ ...base, name: 'bad', analysis } as unknown as Parameters<
            typeof defineOperator
          >[0])
        ).toThrow(expect.objectContaining({ code: ErrorCodes.invalidDefinition }))
      refused([])
      refused({ extra: true })
      refused({ external: false })
      refused({ external: true, failures: [] })
      refused({ failures: [{}] })
      refused({ failures: [{ code: 'x', when: { nope: 1 } }] })
      refused({ failures: [{ code: 'x', when: { value: { below: 'a' } } }] })
      refused({ failures: [{ code: 'x', parameter: 'nope' }] })
      refused({ failures: [{ code: 'x', may: false }] })
    })
  })
})

describe('running a node', () => {
  const findings = async (expression: unknown, instance: FigTree = fig) =>
    (await fallbackCoverage(instance, expression)).uncovered.map((finding) => ({
      ...where(finding),
      certainty: finding.certainty,
    }))
  const typeCheck = (path: (string | number)[], parameter: string) => ({
    path,
    code: ErrorCodes.typeCheck,
    parameter,
    certainty: 'may',
  })
  const divisor = (path: (string | number)[], certainty: 'may' | 'always') => ({
    path,
    code: ErrorCodes.nonFiniteResult,
    parameter: 'by',
    certainty,
  })
  const lower = { $lower: '$data.s' }

  test('a node on known inputs folds, so what it gives is exact', async () => {
    expect(await findings({ $divide: [1, { $plus: [{ $multiply: [2, 3] }, 1] }] })).toEqual([])
    expect(await findings({ $divide: [1, { $subtract: [2, 2] }] })).toEqual([divisor([], 'always')])
  })

  test("a run's failure carries the engine's code and message, and a rule's parameter", async () => {
    const empty = { $min: { $filter: { input: [1, 2], each: false } } }
    expect((await fallbackCoverage(fig, empty)).uncovered).toEqual([
      {
        path: [],
        code: ErrorCodes.emptyAggregate,
        message: expect.stringContaining('min – '),
        certainty: 'always',
        operator: 'min',
        parameter: 'values',
      },
    ])
  })

  test('an input that is one of a few values: a run for each', async () => {
    expect(await findings({ $divide: [1, { $if: ['$data.c', 0, 2] }] })).toEqual([
      divisor([], 'may'),
    ])
    expect(await findings({ $divide: [1, { $if: ['$data.c', 1, 2] }] })).toEqual([])
  })

  test('a child no run asks for reports nothing, its fallbacks included', async () => {
    const risky = { $divide: [1, '$data.n'] }
    const none = { uncovered: [], covered: [] }
    expect(await coverage({ $if: [true, 'x', risky] })).toEqual(none)
    expect(await coverage({ $if: [true, 'x', { ...risky, fallback: 0 }] })).toEqual(none)
    expect(await coverage({ $match: { value: 'b', branches: { a: risky, b: 1 } } })).toEqual(none)
    expect(await coverage({ $get: { path: 'x', from: { x: 1 }, default: risky } })).toEqual(none)
  })

  test('a child whose value is not known is handed back, failures and all', async () => {
    expect(await findings({ $if: [true, lower, 'x'] })).toEqual([typeCheck(['$if', 1], 'value')])
    // What it hands back is what the branch gives, here anything
    expect(await findings({ $upper: { $if: [true, '$data.n', 'x'] } })).toEqual([
      typeCheck([], 'value'),
    ])
    expect(await findings({ $upper: { $if: [false, '$data.n', 'x'] } })).toEqual([])
    const branches = { a: '$data.x', b: 'B' }
    expect(await findings({ $upper: { $match: { value: 'a', branches } } })).toEqual([
      typeCheck([], 'value'),
    ])
  })

  test('a body that waits on a value nothing knows is not run', async () => {
    // firstOf skips a null, so whether it goes on depends on the data
    expect(await findings({ $firstOf: ['$data.a', lower] })).toEqual([
      typeCheck(['$firstOf', 1], 'value'),
    ])
    expect(await findings({ $firstOf: ['a', lower] })).toEqual([])
  })

  test('a decider is decided by a known operand, wherever it is', async () => {
    expect(await findings({ $or: [true, lower] })).toEqual([])
    expect(await findings({ $or: [lower, true] })).toEqual([])
    expect(await findings({ $and: [lower, false] })).toEqual([])
    expect(await findings({ $or: [false, lower] })).toEqual([typeCheck(['$or', 1], 'value')])
  })

  test("an operand's failure is parked, and raised only where nothing decides", async () => {
    const fails = { $divide: [1, 0] }
    expect(await findings({ $or: [fails, true] })).toEqual([])
    expect(await findings({ $or: [fails, false] })).toEqual([divisor(['$or', 0], 'always')])
  })

  test("a race starts every operand, so an operand's own fallbacks count", async () => {
    const guarded = { $divide: [1, '$data.n'], fallback: 0 }
    const { covered } = await fallbackCoverage(fig, { $or: [true, guarded] })
    expect(covered.map((finding) => finding.coveredBy)).toEqual([
      ['$or', 1],
      ['$or', 1],
    ])
  })

  test('an eager child that always fails means its node never runs', async () => {
    // subtract's own check on `minus` is moot
    expect(await findings({ $subtract: [{ $divide: [1, 0] }, '$data.s'] })).toEqual([
      divisor(['$subtract', 0], 'always'),
    ])
  })

  test('a holder the layers never ask for is never evaluated', async () => {
    const each = '$element'
    expect(await findings({ $map: { input: [1], nullInputDefault: node, each } })).toEqual([])
  })

  test('a declared host body is run, async or not, and its run replaces its rules', async () => {
    const later = defineOperator({
      name: 'later',
      category: 'other',
      parameters: { value: { type: 'number' } },
      positionalParams: ['value'],
      returns: 'number',
      analysis: {},
      evaluate: async ({ value }) => {
        await Promise.resolve()
        if (value < 0) throw new OperatorFailure('negative')
        return value
      },
    })
    const hosts = new FigTree({ operators: [coreOperators, [risky, later]] })
    expect(await findings({ $later: -1 }, hosts)).toEqual([
      { path: [], code: ErrorCodes.operatorFailure, certainty: 'always' },
    ])
    expect(await findings({ $divide: [1, { $later: 2 }] }, hosts)).toEqual([])
    // An undeclared one is never run
    expect(await findings({ $risky: 2 }, hosts)).toEqual([
      { path: [], code: external, certainty: 'may' },
    ])
  })

  test('a declared body that does not settle is given up on, and not run again', async () => {
    let calls = 0
    const waiting = defineOperator({
      name: 'waiting',
      category: 'other',
      parameters: { value: { type: 'string' } },
      positionalParams: ['value'],
      returns: 'string',
      analysis: {},
      evaluate: () => {
        calls++
        return new Promise<string>(() => {})
      },
    })
    const hosts = new FigTree({ operators: [coreOperators, [waiting]] })
    // Its rules and its `returns` decide: a string, which may be empty
    const expression = {
      a: { $divide: [1, { $length: { $waiting: 'x' } }] },
      b: { $waiting: 'y' },
    }
    expect(await findings(expression, hosts)).toEqual([divisor(['a'], 'may')])
    expect(calls).toBe(1)
  })
})

describe('per-element walks', () => {
  const findings = async (expression: unknown) =>
    (await fallbackCoverage(fig, expression)).uncovered.map((finding) => ({
      ...where(finding),
      certainty: finding.certainty,
    }))
  const divisor = (path: (string | number)[], certainty: 'may' | 'always') => ({
    path,
    code: ErrorCodes.nonFiniteResult,
    parameter: 'by',
    certainty,
  })
  const inverse = { $divide: [1, '$element'] }

  test('each element is walked with its own $element and $index', async () => {
    // Element 1 decides some before element 0's division by 0 matters
    expect(await findings({ $some: { input: [0, 1], each: inverse } })).toEqual([])
    const each = { $divide: [1, '$nIndex'] }
    expect(await findings({ $some: { input: ['a', 'b'], as: 'n', each } })).toEqual([])
  })

  test('an element that gives one of a few values is run with each of them', async () => {
    // Element 0 matches or not, element 1 always does: find never needs its
    // noMatchDefault, so it never returns null
    const each = { $if: ['$data.c', true, { $equal: ['$index', 1] }] }
    const found = { $find: { input: [[1], [2]], each } }
    expect(await findings({ $map: { input: found, each: '$element' } })).toEqual([])
  })

  test('a failure certain for one element and absent for another may happen', async () => {
    // Nothing decides every, so element 0's parked failure fails it
    expect(await findings({ $every: { input: [0, 1], each: inverse } })).toEqual([
      divisor(['$every', 'each'], 'may'),
    ])
    expect(await findings({ $map: { input: [0, 0], each: inverse } })).toEqual([
      divisor(['$map', 'each'], 'always'),
    ])
  })

  test('an element a decider never needed reports only what its own fallbacks catch', async () => {
    const each = { ...inverse, fallback: false }
    const { uncovered, covered } = await fallbackCoverage(fig, {
      $some: { input: [1, 0], each },
    })
    expect(uncovered).toEqual([])
    expect(
      covered.map(({ path, certainty, coveredBy }) => ({ path, certainty, coveredBy }))
    ).toEqual([{ path: ['$some', 'each'], certainty: 'may', coveredBy: ['$some', 'each'] }])
  })

  test('a vars block in an each is walked per element, one outside it once', async () => {
    const vars = { d: { $subtract: ['$element', 1] } }
    expect(
      await findings({ $map: { input: [2, 1], each: { $divide: [1, '$vars.d'], vars } } })
    ).toEqual([divisor(['$map', 'each'], 'may')])
    const outside = {
      $map: { input: [1, 2], each: { $plus: ['$element', '$vars.k'] } },
      vars: { k: { $length: '$data.s' } },
    }
    expect(await coverage(outside)).toEqual({
      uncovered: [{ path: ['vars', 'k'], code: ErrorCodes.typeCheck, parameter: 'value' }],
      covered: [],
    })
  })

  test('a var reads the bindings where it is declared', async () => {
    // x is the outer element, an array, whatever the inner one is
    const each = {
      $map: { input: '$element', each: { $upper: '$vars.x' } },
      vars: { x: '$element' },
    }
    expect(await findings({ $map: { input: [['a'], ['b']], each } })).toEqual([
      {
        path: ['$map', 'each', '$map', 'each'],
        code: ErrorCodes.typeCheck,
        parameter: 'value',
        certainty: 'always',
      },
    ])
  })

  test('a map not run keeps what each element gave, in order', async () => {
    // Two elements, each from 1 up: never empty
    const each = { $plus: ['$element', { $length: '$data.s', fallback: 0 }] }
    expect(await findings({ $max: { $map: { input: [1, 2], each } } })).toEqual([])
    expect(await findings({ $divide: [1, { $max: { $map: { input: [1, 2], each } } }] })).toEqual(
      []
    )
  })

  test('past 16 walks of a node, its each is walked once', async () => {
    const many = Array.from({ length: 17 }, (_, i) => i)
    expect(await findings({ $some: { input: many, each: inverse } })).toEqual([
      divisor(['$some', 'each'], 'may'),
    ])
    // Nested walks multiply: 8 × 2 are walked per element, 9 × 2 are not
    const nested = (rows: number) => ({
      $map: {
        input: Array.from({ length: rows }, () => [0, 1]),
        each: { $some: { input: '$element', each: inverse } },
      },
    })
    expect(await findings(nested(8))).toEqual([])
    expect(await findings(nested(9))).toEqual([divisor(['$map', 'each', '$some', 'each'], 'may')])
  })

  test('an empty input walks no element', async () => {
    expect(await findings({ $map: { input: [], each: { $divide: [1, 0] } } })).toEqual([])
  })

  test('a host body asking for an element the input does not have is not run', async () => {
    const sixth = defineOperator({
      name: 'sixth',
      category: 'array',
      parameters: {
        input: { type: 'array' },
        each: { type: 'any', evaluation: 'perElement', over: 'input' },
      },
      positionalParams: ['input', 'each'],
      analysis: {},
      evaluate: ({ each }) => each.evaluate(5),
    })
    const hosts = new FigTree({ operators: [coreOperators, [sixth]] })
    // The engine binds no element, so it returns null and nothing fails; a
    // run giving it the one element's value would say the root always does
    const { uncovered } = await fallbackCoverage(hosts, {
      $divide: [1, { $subtract: [{ $sixth: { input: [2], each: '$element' } }, 2] }],
    })
    expect(uncovered.map(({ path, certainty }) => ({ path, certainty }))).toEqual([
      { path: [], certainty: 'may' },
      { path: ['$divide', 1], certainty: 'may' },
    ])
  })
})

describe('a fragment call', () => {
  const withFragments = withRisky({
    fragments: {
      maybeFail: {
        expression: { $if: ['$params.c', { $divide: [1, 0] }, 1] },
        parameters: { c: { type: 'any' } },
      },
      ratio: {
        expression: { $divide: ['$params.a', '$params.b'] },
        parameters: { a: { type: 'number' }, b: { type: 'number' } },
      },
    },
  })

  test('is not certain to fail for a certain failure its body or argument may skip', async () => {
    // Each call returns 1 where it returns, so the root divides by 0
    const calls = [
      { $maybeFail: { c: '$data.c' } },
      { $ratio: { a: { $if: ['$data.c', { $divide: [1, 0] }, 2] }, b: 2 } },
    ]
    for (const call of calls) {
      const { uncovered } = await fallbackCoverage(withFragments, {
        $divide: [1, { $subtract: [call, 1] }],
      })
      // Whatever the call returns, the root's own check still counts
      expect(uncovered.map(where)).toContainEqual(
        expect.objectContaining({ path: [], code: ErrorCodes.nonFiniteResult })
      )
    }
  })
})

describe('a long literal', () => {
  // More elements than one call takes as spread arguments
  const long = Array.from({ length: 200_000 }, (_, i) => i + 1)
  const computed = { $divide: [1, '$data.x'] }

  test("as an iterator's input, its elements widen to the range they span", async () => {
    const each = { $divide: [1, '$element'] }
    expect(await uncovered({ $some: { input: long, each } })).toEqual([])
  })

  test('with a computed element, which fails where it sits', async () => {
    const cases: [unknown, (string | number)[]][] = [
      [[...long, computed], [200_000]],
      [{ $max: [...long, computed] }, ['$max', 200_000]],
    ]
    for (const [expression, path] of cases)
      expect((await coverage(expression)).uncovered).toEqual([
        { path, code: ErrorCodes.typeCheck, parameter: 'by' },
        { path, code: ErrorCodes.nonFiniteResult, parameter: 'by' },
      ])
  })
})

test('a deep path into the data takes no longer to follow than its depth', async () => {
  // Each index could be into an array, an object or an opaque value
  const path = (depth: number) => ['$data', ...Array.from({ length: depth }, (_, i) => i)].join('.')
  const start = performance.now()
  const deep = await coverage({ $plus: [path(14), 1] })
  expect(performance.now() - start).toBeLessThan(1000)
  expect(deep).toEqual(await coverage({ $plus: [path(2), 1] }))
})

describe('static errors', () => {
  // `evaluate()` refuses an expression with a static error before anything
  // runs, so every one is uncovered, whatever fallback encloses it, nothing
  // is covered, and nothing is walked
  const cases: [string, unknown, FigTree, ReturnType<typeof where>[]][] = [
    [
      'an unknown operator under an enclosing fallback',
      { a: { $plus: [{ operator: 'gone' }, 1], fallback: 0 } },
      fig,
      [{ path: ['a', '$plus', 0], code: ErrorCodes.unknownOperator }],
    ],
    [
      'a missing required parameter: the body is never run without it',
      { operator: 'if', condition: true, fallback: 1 },
      fig,
      [{ path: [], code: ErrorCodes.missingRequired, parameter: 'then' }],
    ],
    [
      'an unresolved var',
      { operator: 'plus', values: ['$vars.nope', 1], fallback: 0 },
      fig,
      [{ path: ['values', 0], code: ErrorCodes.unresolvedVar }],
    ],
    [
      'a literal of the wrong type',
      { $plus: ['x', 2], fallback: 0 },
      fig,
      [{ path: ['$plus'], code: ErrorCodes.typeCheck, parameter: 'values' }],
    ],
    [
      'an unrecognized $ key, a fallback beside it',
      { $myPluginOp: [1, 2], fallback: 'x' },
      fig,
      [{ path: ['$myPluginOp'], code: ErrorCodes.unrecognizedIdentifier }],
    ],
    [
      'an unrecognized $ key inside a call, whose literal it also makes the wrong type',
      { $plus: [1, { $myPluginOp: 1 }], fallback: 0 },
      fig,
      [
        { path: ['$plus'], code: ErrorCodes.typeCheck, parameter: 'values' },
        { path: ['$plus', 1, '$myPluginOp'], code: ErrorCodes.unrecognizedIdentifier },
      ],
    ],
    [
      'an invalid node',
      { a: { operator: 'plus', fragment: 'f' }, b: 1 },
      fig,
      [{ path: ['a'], code: ErrorCodes.malformedNode }],
    ],
    [
      "several, in validate()'s order, and none of the walk's findings beside them",
      { a: { operator: 'gone' }, b: { $divide: ['$data.n', '$data.d'] }, c: '$vars.nope' },
      fig,
      [
        { path: ['a'], code: ErrorCodes.unknownOperator },
        { path: ['c'], code: ErrorCodes.unresolvedVar },
      ],
    ],
    [
      "the instance's limits, first, as the gate reads them",
      { a: { $plus: [1, '$vars.nope'] }, b: { $plus: [1, 2] } },
      withRisky({ maxNodes: 1 }),
      [
        { path: [], code: ErrorCodes.maxNodesExceeded },
        { path: ['a', '$plus', 1], code: ErrorCodes.unresolvedVar },
      ],
    ],
    [
      'under a timeout, with no timeout finding: nothing runs to wait',
      { $risky: { operator: 'gone' } },
      withRisky({ timeout: 50 }),
      [{ path: ['$risky'], code: ErrorCodes.unknownOperator }],
    ],
  ]

  test.each(cases)('%s', async (_label, expression, instance, expected) => {
    const { uncovered, covered } = await fallbackCoverage(instance, expression)
    expect(uncovered.map(where)).toEqual(expected)
    expect(uncovered.every((finding) => finding.certainty === 'always')).toBe(true)
    expect(covered).toEqual([])
  })

  test.each(cases)(
    'agrees with validate() and evaluate(): %s',
    async (_label, expression, instance) => {
      const { uncovered } = await fallbackCoverage(instance, expression)
      const errors = instance
        .validate(expression)
        .issues.filter((issue) => issue.severity === 'error')
      expect(uncovered).toEqual(
        errors.map(({ path, code, message, operator, parameter }) => ({
          path,
          code,
          message,
          certainty: 'always',
          ...(operator !== undefined ? { operator } : {}),
          ...(parameter !== undefined ? { parameter } : {}),
        }))
      )
      // The one `evaluate()` throws is the first
      await expect(instance.evaluate(expression)).rejects.toMatchObject({
        code: uncovered[0].code,
        path: uncovered[0].path,
      })
    }
  )

  test('warnings alone do not stop the walk', async () => {
    expect(await uncovered({ a: '$typo', b: { $divide: [1, '$data.d'] } })).toEqual([['b'], ['b']])
  })
})

describe('misuse', () => {
  test('anything but a FigTree instance is a TypeError', async () => {
    await expect(fallbackCoverage({}, 1)).rejects.toThrow(TypeError)
    await expect(fallbackCoverage(undefined, 1)).rejects.toThrow(TypeError)
  })
})
