/**
 * The `./authoring` surface and `fallbackCoverage` without a timeout
 * (docs-dev/v3-specs/v3-fallback-coverage.md). The timeout rule has its own
 * suite, test/authoring-timeout.test.ts; the case corpus with the soundness
 * check is test/coverage-cases.test.ts, and the core failure rules are
 * checked against the engine in test/coverage-rules.test.ts.
 *
 * The tests of where findings sit and which fallback covers them use
 * `risky`, a host operator that declares no `coverage`, so is external: it
 * gives one `operator-failure` wherever it is, and nothing else.
 *
 * The subpath's types export from the root. test/exports.test.ts lists
 * values only, so they are checked here, where `pnpm typecheck` fails if one
 * goes missing.
 */
import { ErrorCodes, FigTree, OperatorFailure, coreOperators, defineOperator } from '../src'
import type {
  CoverageFinding,
  CoverageTest,
  CoveredFinding,
  FailureRule,
  FallbackCoverage,
  FallbackCoverageOptions,
  FigTreeOptions,
  OperatorCoverage,
} from '../src'
import * as authoring from '../src/authoring'
import { fallbackCoverage } from '../src/authoring'

const risky = defineOperator({
  name: 'risky',
  category: 'other',
  description: 'Anything, returned as it is, by code nothing describes',
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
  const options: FallbackCoverageOptions = { timeout: 50, numbers: 'strict' }
  const result: FallbackCoverage = await fallbackCoverage(fig, 1, options)
  expect(result).toEqual({ uncovered: [], covered: [] })
  const test: CoverageTest = { not: { below: 0 } }
  const rule: FailureRule = { code: 'operator-failure', when: { value: test } }
  const declared: OperatorCoverage = { failures: [rule] }
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

describe('numbers', () => {
  const sum = {
    $plus: [
      { $length: '$data.a', fallback: 0 },
      { $length: '$data.b', fallback: 0 },
    ],
  }

  test("'strict' counts overflow on numbers the walk cannot pin down, 'ordinary' does not", async () => {
    expect((await fallbackCoverage(fig, sum)).uncovered).toEqual([])
    expect((await fallbackCoverage(fig, sum, { numbers: 'ordinary' })).uncovered).toEqual([])
    expect(
      (await fallbackCoverage(fig, sum, { numbers: 'strict' })).uncovered.map(
        (finding) => finding.code
      )
    ).toEqual([ErrorCodes.nonFiniteResult])
  })

  test('an overflow is never certain, so the node above it still checks its inputs', async () => {
    // Never null, so only the overflow could end subtract; with x 'a' it
    // gives 0, and divide fails
    const count = { $length: { $buildString: ['%1', '$data.x'] } }
    const ratio = { $divide: [1, { $subtract: [count, 1] }] }
    const { uncovered } = await fallbackCoverage(fig, ratio, { numbers: 'strict' })
    expect(
      uncovered.map((finding) => ({ ...where(finding), certainty: finding.certainty }))
    ).toEqual([
      { path: [], code: ErrorCodes.nonFiniteResult, parameter: 'by', certainty: 'may' },
      { path: [], code: ErrorCodes.nonFiniteResult, certainty: 'may' },
      { path: ['$divide', 1], code: ErrorCodes.nonFiniteResult, certainty: 'may' },
    ])
  })

  test('anything else is refused', async () => {
    await expect(
      fallbackCoverage(fig, 1, { numbers: 'loose' as FallbackCoverageOptions['numbers'] })
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
    // Returned as it is, so even a reference-shaped string cannot throw
    const literal = withRisky({ operatorDefaults: { risky: { fallback: '$data.x' } } })
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
    expect((await calls({ a: { $safe: {} }, b: { $plain: {} } })).uncovered).toEqual([])
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
      description: 'Returns its value',
      parameters: { value: {} },
      positionalParams: ['value'],
      coverage: { failures: [], output: { param: 'value' } },
      evaluate: ({ value }) => value,
    })
    const hosts = new FigTree({ operators: [coreOperators, [echo]] })
    expect((await fallbackCoverage(hosts, { $upper: { $echo: 'x' } })).uncovered).toEqual([])
    expect(() =>
      defineOperator({
        name: 'bad',
        category: 'other',
        description: 'd',
        parameters: { value: {} },
        coverage: { output: { param: 'nope' } },
        evaluate: () => 1,
      })
    ).toThrow(expect.objectContaining({ code: ErrorCodes.invalidDefinition }))
  })

  describe('the result boundary, under strict numbers', () => {
    const strict = { numbers: 'strict' as const }
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
      description: 'The sum of some numbers',
      parameters: values,
      positionalParams: ['...values'],
      returns: 'number',
      coverage: { output: { sum: 'values' } },
      evaluate: ({ values }) => (values as number[]).reduce((sum, value) => sum + value, 0),
    })
    const word = defineOperator({
      name: 'word',
      category: 'string',
      description: 'Its value, or a placeholder for an empty one',
      parameters: { value: { type: 'string' } },
      positionalParams: ['value'],
      returns: 'string',
      coverage: { output: { type: 'string', minLength: 1 } },
      evaluate: ({ value }) => value || '-',
    })
    const picky = defineOperator({
      name: 'picky',
      category: 'string',
      description: 'Refuses an empty string',
      parameters: { value: { type: 'string' } },
      positionalParams: ['value'],
      returns: 'string',
      coverage: { failures: [{ code: 'operator-failure', when: { value: { empty: true } } }] },
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
          description: 'd',
          parameters: { value: { type: 'number' }, values: { type: 'array' } },
          coverage: { output },
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
      description: 'Refuses an empty string',
      parameters: { value: { type: 'string' as const } },
      positionalParams: ['value'],
      returns: 'string' as const,
      evaluate: ({ value }: { value: string }) => value,
    }
    const picky = defineOperator({
      ...base,
      name: 'picky',
      coverage: {
        failures: [{ code: 'operator-failure', parameter: 'value', when: { value: '' } }],
      },
      evaluate: ({ value }) => {
        if (value === '') throw new OperatorFailure('nothing to pick')
        return value
      },
    })
    const fetching = defineOperator({ ...base, name: 'fetching', coverage: { external: true } })
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

    test('defineOperator() refuses a malformed coverage', () => {
      const refused = (coverage: unknown) =>
        expect(() =>
          defineOperator({ ...base, name: 'bad', coverage } as unknown as Parameters<
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
      description: 'Refuses a negative number, a tick later',
      parameters: { value: { type: 'number' } },
      positionalParams: ['value'],
      returns: 'number',
      coverage: {},
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
      description: 'Waits on state the analysis never has',
      parameters: { value: { type: 'string' } },
      positionalParams: ['value'],
      returns: 'string',
      coverage: {},
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

test('an invalid node always fails, with its static error', async () => {
  expect(
    (await fallbackCoverage(fig, { a: { operator: 'plus', fragment: 'f' }, b: 1 })).uncovered
  ).toEqual([
    expect.objectContaining({ path: ['a'], code: ErrorCodes.malformedNode, certainty: 'always' }),
  ])
})

describe('misuse', () => {
  test('anything but a FigTree instance is a TypeError', async () => {
    await expect(fallbackCoverage({}, 1)).rejects.toThrow(TypeError)
    await expect(fallbackCoverage(undefined, 1)).rejects.toThrow(TypeError)
  })

  test('a bad timeout is refused as evaluate() refuses it', async () => {
    for (const timeout of [0, -1, Number.NaN, Infinity, '50' as unknown as number])
      await expect(fallbackCoverage(fig, 1, { timeout })).rejects.toThrow(
        expect.objectContaining({ code: ErrorCodes.invalidOptions })
      )
  })
})
