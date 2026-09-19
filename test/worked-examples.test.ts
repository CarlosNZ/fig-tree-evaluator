/**
 * Worked example 1, as far as Phase 7 can carry it
 * (docs-dev/v3-specs/v3-worked-examples.md § 1).
 *
 * The example is a `mode: 'report'` demonstration over five holes, two of
 * which are `http` nodes — so what lands at the core-complete milestone is
 * the throw-mode VALUE half over the three holes that need neither report
 * mode nor a client: success via the null gradient, plain success, and a
 * deep uncaught failure. The full report-mode shape, with `errors` in tree
 * order and both `holePath`s, is Phase 12.1's acceptance test.
 *
 * Only the behaviours are asserted, never the encodings — the doc's own
 * reading rule.
 */
import { FigTree, FigTreeError } from '../src'
import { coreOperators } from '../src/operators'
import { rejection } from './helpers/rejection'
import { compileSpyOp } from './fixtures/evalOperators'

const fig = new FigTree()

const dashboard = {
  meta: { generated: 'v3-example', version: 3 },
  user: {
    displayName: { $buildString: ['%1 %2', '$data.user.first', '$data.user.last'] },
  },
  stats: {
    total: { $plus: ['$data.stats.wins', '$data.stats.losses'] },
    summary: {
      $buildString: ['Win ratio: %1', { $divide: ['$data.stats.wins', '$data.stats.losses'] }],
    },
  },
}

const data = { user: { first: 'Ada', id: 42 }, stats: { wins: 10, losses: 0 } }

test('the healthy holes, and the constant shell that is not a hole', async () => {
  const healthy = { ...dashboard, stats: { total: dashboard.stats.total } }

  expect(await fig.evaluate(healthy, { data })).toEqual({
    meta: { generated: 'v3-example', version: 3 },
    // `user.last` is missing -> null -> buildString renders '' -> a
    // trailing space. Success via the null gradient: no error, no
    // fallback involvement, because absence is not failure
    user: { displayName: 'Ada ' },
    stats: { total: 10 },
  })
})

test("the gradient's opt-outs close the trailing space, and fallback is not one of them", async () => {
  const nameOf = (extra: Record<string, unknown>) =>
    fig.evaluate(
      {
        $buildString: {
          template: '%1 %2',
          substitutions: ['$data.user.first', '$data.user.last'],
          ...extra,
        },
      },
      { data }
    )
  expect(await nameOf({})).toBe('Ada ')
  expect(await nameOf({ closeGaps: true })).toBe('Ada')
  expect(await nameOf({ nullValueDefault: '(unknown)' })).toBe('Ada (unknown)')
})

test('the deep uncaught failure escapes its hole, and throw mode rejects', async () => {
  const error = await rejection<FigTreeError>(fig.evaluate(dashboard, { data }))
  // 10 / 0 is stopped by the finite-number guard, two levels below the
  // hole root, with no fallback anywhere between
  expect(error.code).toBe('non-finite-result')
  expect(error.path).toEqual(['stats', 'summary', '$buildString', 1])
})

test('the sibling hole inside the same literal is independent — stats is plain structure', async () => {
  expect(
    await fig.evaluate(
      {
        ...dashboard,
        stats: { ...dashboard.stats, summary: { ...dashboard.stats.summary, fallback: null } },
      },
      { data }
    )
  ).toEqual({
    meta: { generated: 'v3-example', version: 3 },
    user: { displayName: 'Ada ' },
    stats: { total: 10, summary: null },
  })
})

/**
 * Worked example 2 — the full lifecycle, as far as Phase 8 can carry it
 * (docs-dev/v3-specs/v3-worked-examples.md § 2).
 *
 * The example runs two expressions across one instance and asserts two
 * things per step: how many times the parse cache compiled, and how many
 * times the mock client fetched. Only the first half is reachable here —
 * the clients and the I/O operators are Phase 9, which is where the fetch
 * counts and the M4 milestone live. So the `http` node is stood in for by
 * a counted operator, and the steps are read for cache behaviour alone.
 *
 * Run as one sequence rather than independent cases, because the point of
 * the example is the state carried from step to step.
 */
describe('lifecycle — two expressions, one instance, the parse half', () => {
  const spy = compileSpyOp('rate')
  const fig = new FigTree({
    operators: [coreOperators, spy.definition],
    data: { org: 'Acme' },
    operatorDefaults: { join: { delimiter: ', ' } },
  })

  const exprA = {
    greeting: { $buildString: ['Welcome to %1', '$data.org'] },
    team: { $join: '$data.team[*].name' },
    rate: { $rate: '$data.currency' },
  }
  const dataA = { currency: 'NZD', team: [{ name: 'Ada' }, { name: 'Grace' }] }
  const exprB = { $rate: '$data.tier' }
  const exprB2 = JSON.parse(JSON.stringify(exprB)) as typeof exprB

  it('step 1 — first evaluation of A compiles once', async () => {
    expect(await fig.evaluate(exprA, { data: dataA })).toEqual({
      greeting: 'Welcome to Acme',
      team: 'Ada, Grace',
      rate: 'NZD',
    })
    expect(spy.compiles()).toBe(1)
  })

  it('step 2 — a structurally different expression compiles once more', async () => {
    spy.reset()
    expect(await fig.evaluate(exprB, { data: { tier: 'silver' } })).toBe('silver')
    expect(spy.compiles()).toBe(1)
  })

  it('step 3 — A again, same instance and data: an identity hit', async () => {
    spy.reset()
    await fig.evaluate(exprA, { data: dataA })
    expect(spy.compiles()).toBe(0)
  })

  it('step 4 — B as a fresh object of the same content: a content hit', async () => {
    spy.reset()
    expect(await fig.evaluate(exprB2, { data: { tier: 'silver' } })).toBe('silver')
    expect(spy.compiles()).toBe(0)
  })

  it('step 5 — both again with different data: still no compile', async () => {
    spy.reset()
    expect(await fig.evaluate(exprA, { data: { currency: 'AUD', team: [{ name: 'Alan' }] } })).toEqual(
      { greeting: 'Welcome to Acme', team: 'Alan', rate: 'AUD' }
    )
    expect(await fig.evaluate(exprB2, { data: { tier: 'gold' } })).toBe('gold')
    expect(spy.compiles()).toBe(0)
  })

  it('step 6 — an operatorDefaults change recompiles, and is in force', async () => {
    spy.reset()
    fig.updateOptions({ operatorDefaults: { join: { delimiter: ' | ' } } })
    expect(await fig.evaluate(exprA, { data: dataA })).toEqual({
      greeting: 'Welcome to Acme',
      team: 'Ada | Grace',
      rate: 'NZD',
    })
    expect(spy.compiles()).toBe(1)
  })
})
