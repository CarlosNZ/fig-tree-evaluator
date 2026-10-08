/**
 * `fallbackCoverage` under a timeout: timeout shielding (fallback rule 3 in
 * "fallback semantics", docs-dev/v3-specs/v3-api.md) reported hole by hole.
 * Worked example 3 in docs-dev/v3-specs/v3-worked-examples.md is the
 * acceptance test; what shielding promises at runtime is asserted in
 * test/evaluate-timeout.test.ts.
 *
 * Only an evaluation that can wait on something outside it can be cut off.
 * Where one can, shielding is all or nothing: each top-level value without
 * a constant fallback is an uncovered `timeout` finding at its path, and
 * where every value has one, each that can wait is a covered one. The
 * operators of ./fixtures/compileRegistry are the host's, so any of them can
 * wait. The findings without a timeout are reported beside them, and are
 * asserted in test/authoring.test.ts.
 */
import { FigTree, coreOperators, defineOperator } from '../src'
import type { CoverageFinding, FigTreeOptions } from '../src'
import { fallbackCoverage } from '../src/authoring'
import { compileOps } from './fixtures/compileRegistry'

const standIns: FigTreeOptions = { operators: [compileOps()] }
const fig = new FigTree(standIns)

/** An instance with a timeout, which is where the analysis reads it from. */
const timed = (options: FigTreeOptions = standIns) => new FigTree({ ...options, timeout: 50 })

const timeouts = (findings: CoverageFinding[]) =>
  findings.filter((finding) => finding.code === 'timeout').map((finding) => finding.path)

const underTimeout = async (expression: unknown, options?: FigTreeOptions) =>
  timeouts((await fallbackCoverage(timed(options), expression)).uncovered)

test('worked example 3: one dynamic fallback leaves its hole uncovered', async () => {
  const banner = {
    greeting: { $format: ['Hi %1', '$data.name'], fallback: 'Hi there' },
    offers: { operator: 'http', url: 'https://api.example.com/offers', fallback: [] },
  }
  expect(await underTimeout(banner)).toEqual([])

  const banner2 = {
    ...banner,
    offers: { ...banner.offers, fallback: '$data.cachedOffers' },
  }
  expect(await underTimeout(banner2)).toEqual([['offers']])
})

test('every hole root needs a constant fallback, and each that lacks one is listed', async () => {
  const partial = {
    a: { $http: 'https://x.test', fallback: [] },
    b: { $plus: ['$data.x', 1] },
  }
  expect(await underTimeout(partial)).toEqual([['b']])
})

test('a nested literal that keeps its vars is listed hole by hole', async () => {
  const sectioned = {
    section: {
      vars: { x: '$data.x' },
      a: { $http: 'https://x.test', fallback: [] },
      b: { $plus: ['$vars.x', 1] },
    },
  }
  expect(await underTimeout(sectioned)).toEqual([['section', 'b']])
})

test('a node root is covered by its own constant fallback', async () => {
  expect(await underTimeout({ $http: 'https://x.test', fallback: null })).toEqual([])
  expect(await underTimeout({ $http: 'https://x.test' })).toEqual([[]])
})

test('an operatorDefaults fallback counts when it is constant', async () => {
  const shieldedByDefaults = {
    operators: [compileOps()],
    operatorDefaults: { http: { fallback: 'offline' } },
  }
  expect(await underTimeout({ a: { $http: 'https://x.test' } }, shieldedByDefaults)).toEqual([])
  // The same expression on the plain instance is uncovered
  expect(await underTimeout({ a: { $http: 'https://x.test' } })).toEqual([['a']])
})

test('a vars block on a plain-literal root does not uncover its holes', async () => {
  // Phase-5 correction: the root skeleton was treated as a single hole when
  // it carried vars, and a skeleton has no fallback of its own — so an
  // expression whose every hole was shielded reported unshielded
  const shared = {
    vars: { base: 'https://api.example.com' },
    offers: { $http: { url: '$vars.base' }, fallback: [] },
    banner: { $http: { url: '$vars.base' }, fallback: 'none' },
  }
  expect(await underTimeout(shared)).toEqual([])

  const partial = { ...shared, banner: { $http: { url: '$vars.base' } } }
  expect(await underTimeout(partial)).toEqual([['banner']])
})

test("the analysis reads the instance's timeout", async () => {
  const expression = { a: { $http: 'https://x.test', fallback: '$data.cached' } }
  expect(timeouts((await fallbackCoverage(timed(), expression)).uncovered)).toEqual([['a']])
  // Without any timeout, a dynamic fallback that cannot throw covers it
  expect((await fallbackCoverage(fig, expression)).uncovered).toEqual([])
})

test('a reference hole is never shielded, so a timeout lists it', async () => {
  expect(
    await underTimeout({ a: '$data.x', b: { $http: 'https://x.test', fallback: null } })
  ).toEqual([['a']])
})

test("a call lifts its body root's constant fallback", async () => {
  const withFragment = timed({
    fragments: { safe: { expression: { $upper: '$data.s', fallback: 'k' } } },
  })
  const all = async (expression: unknown) =>
    (await fallbackCoverage(withFragment, expression)).uncovered.map((finding) => [
      finding.path,
      finding.code,
    ])
  expect(await all({ a: { $safe: {} } })).toEqual([])
  // Shielded all the same, but its arguments are evaluated and checked
  // before the body runs, outside the body's fallbacks
  expect(await all({ a: { fragment: 'safe', parameters: '$data.args' } })).toEqual([
    [['a', 'parameters'], 'type-check'],
  ])
})

test('a timeout finding sits beside the findings without one', async () => {
  const { uncovered } = await fallbackCoverage(timed(), { b: { $plus: ['$data.x', 1] } })
  expect(uncovered).toEqual([
    expect.objectContaining({ path: ['b'], code: 'operator-failure' }),
    {
      path: ['b'],
      code: 'timeout',
      message: expect.stringContaining('static fallback'),
      certainty: 'may',
    },
  ])
})

describe('only an evaluation that can wait can be cut off', () => {
  const io = defineOperator({
    name: 'io',
    category: 'other',
    description: 'Anything, fetched by code nothing describes',
    parameters: { value: {} },
    positionalParams: ['value'],
    evaluate: ({ value }) => value,
  })
  const nap = defineOperator({
    name: 'nap',
    category: 'other',
    description: 'A number, handed back once a timer fires',
    parameters: { value: { type: 'number' } },
    positionalParams: ['value'],
    returns: 'number',
    analysis: {},
    evaluate: async ({ value }) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return value
    },
  })
  const waiting: FigTreeOptions = {
    operators: [coreOperators, [io, nap]],
    fragments: {
      fetch: { expression: { $io: 1 } },
      echo: { expression: '$params.v', parameters: { v: { type: 'any' } } },
      ignore: { expression: 1, parameters: { v: { type: 'any' } } },
    },
  }
  const cutOff = (expression: unknown) => underTimeout(expression, waiting)
  const fetched = { $io: 1 }

  test('nothing that can wait means nothing can be cut off', async () => {
    expect(await cutOff({ a: { $upper: 'x' }, b: { $plus: ['$data.x', 1] } })).toEqual([])
  })

  test('a host operator can wait, declared or not, and so can every value beside it', async () => {
    expect(await cutOff({ a: fetched, b: { $upper: 'x' } })).toEqual([['a'], ['b']])
    expect(await cutOff({ a: { $nap: 1 } })).toEqual([['a']])
  })

  test('waiting is read through vars, fallbacks, fragment bodies and arguments', async () => {
    expect(await cutOff({ a: '$vars.r', vars: { r: fetched } })).toEqual([['a']])
    expect(await cutOff({ a: { $upper: '$data.s', fallback: fetched } })).toEqual([['a']])
    // upper cannot fail here, so its fallback never runs
    expect(await cutOff({ a: { $upper: 'x', fallback: fetched } })).toEqual([])
    expect(await cutOff({ a: { $fetch: {} } })).toEqual([['a']])
    expect(await cutOff({ a: { $echo: { v: fetched } } })).toEqual([['a']])
    // An argument the body never reads is never evaluated
    expect(await cutOff({ a: { $ignore: { v: fetched } } })).toEqual([])
  })

  test('a child no run waits on holds nothing up', async () => {
    expect(await cutOff({ a: { $if: [true, 1, fetched] } })).toEqual([])
    // A decider starts every operand, but answers before this one does
    expect(await cutOff({ a: { $or: [true, fetched] } })).toEqual([])
    expect(await cutOff({ a: { $or: [false, fetched] } })).toEqual([['a']])
    const each = { $if: [{ $equal: ['$index', 0] }, true, fetched] }
    expect(await cutOff({ a: { $some: { input: [1, 2], each } } })).toEqual([])
  })

  test('a shielded value that can wait is covered against the timeout, one that cannot is not', async () => {
    const shielded = { a: { $io: 1, fallback: 0 }, b: { $upper: 'x', fallback: '' } }
    const { uncovered, covered } = await fallbackCoverage(timed(waiting), shielded)
    expect(timeouts(uncovered)).toEqual([])
    expect(
      covered
        .filter((finding) => finding.code === 'timeout')
        .map((finding) => [finding.path, finding.coveredBy])
    ).toEqual([[['a'], ['a']]])
  })

  test('a shielded value inside a nested literal that keeps its vars is covered at its own path', async () => {
    const sectioned = {
      section: {
        vars: { u: 'x' },
        a: { $io: 1, fallback: 0 },
        b: { $upper: '$vars.u', fallback: '' },
      },
    }
    const { uncovered, covered } = await fallbackCoverage(timed(waiting), sectioned)
    expect(timeouts(uncovered)).toEqual([])
    expect(
      covered
        .filter((finding) => finding.code === 'timeout')
        .map((finding) => [finding.path, finding.coveredBy])
    ).toEqual([
      [
        ['section', 'a'],
        ['section', 'a'],
      ],
    ])
  })
})
