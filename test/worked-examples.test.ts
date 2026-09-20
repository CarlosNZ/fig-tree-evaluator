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
import { FigTree, FigTreeError, httpOperators } from '../src'
import { coreOperators } from '../src/operators'
import { MockHttpClient } from './helpers'
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
    expect(
      await fig.evaluate(exprA, { data: { currency: 'AUD', team: [{ name: 'Alan' }] } })
    ).toEqual({ greeting: 'Welcome to Acme', team: 'Alan', rate: 'AUD' })
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

/**
 * Worked example 2 in full (docs-dev/v3-specs/v3-worked-examples.md § 2) —
 * the Phase-9 milestone. The block above reads the same six steps for
 * compiles; this one reads them for REQUESTS, which is what the example
 * exists to show, and which needed `http` and the result cache to exist.
 *
 * Binding assertions, per the doc's own list: the result values, the fetch
 * counts 1 / 1 / 1 / 1 / 3 across the steps, and step 6's two invalidation
 * stories pulling in opposite directions. Not asserted: the cache-key
 * encoding, which the doc marks illustrative.
 *
 * One deviation from the doc's listing, and it is instrumentation rather
 * than behaviour: expression A carries a fourth hole whose only job is to
 * count compiles, so "recompile without refetching" and its mirror can be
 * asserted on one expression.
 */
describe('lifecycle — the full example, fetch counts and all', () => {
  const compiles = compileSpyOp('counted')
  const http = new MockHttpClient({
    responses: {
      'currency=NZD': { rate: 0.61, base: 'USD' },
      'currency=AUD': { rate: 0.7301, base: 'USD' },
      'perks/gold': ['priority-support', 'swag'],
    },
  })

  // Step 0 — construction. Pure registration and validation: nothing is
  // parsed, evaluated or fetched
  const lifecycle = new FigTree({
    operators: [coreOperators, httpOperators(http), compiles.definition],
    data: { org: 'Acme' },
    operatorDefaults: { join: { delimiter: ', ' } },
    cache: { maxSize: 50 },
  })

  const exprA = {
    greeting: { $buildString: ['Welcome to %1', '$data.org'] },
    team: { $join: '$data.team[*].name' },
    rate: {
      operator: 'http',
      url: 'https://api.example.com/rates',
      query: { currency: '$data.currency' },
      returnPath: 'rate',
    },
    counted: { $counted: 'instrumentation' },
  }
  const dataA = { currency: 'NZD', team: [{ name: 'Ada' }, { name: 'Grace' }] }

  const exprB = {
    operator: 'match',
    value: '$data.tier',
    branches: {
      gold: { $http: 'https://api.example.com/perks/gold' },
      silver: ['standard-support'],
    },
    default: [],
  }
  const exprB2 = JSON.parse(JSON.stringify(exprB)) as typeof exprB

  it('step 0 — construction fetches nothing', () => {
    expect(http.callCount).toBe(0)
  })

  it('step 1 — A: the instance data merges under the call’s, and one fetch fires', async () => {
    expect(await lifecycle.evaluate(exprA, { data: dataA })).toEqual({
      greeting: 'Welcome to Acme',
      team: 'Ada, Grace',
      // The FULL response was stored; `returnPath` drilled it afterwards
      rate: 0.61,
      counted: 'instrumentation',
    })
    expect(http.callCount).toBe(1)
  })

  it('step 2 — B: the unchosen branch never runs, so nothing is fetched', async () => {
    expect(await lifecycle.evaluate(exprB, { data: { tier: 'silver' } })).toEqual([
      'standard-support',
    ])
    // Laziness observable purely through the client — that is the test hook
    expect(http.callCount).toBe(1)
  })

  it('step 3 — A again, same data: the steady-state hot path, no network', async () => {
    expect(await lifecycle.evaluate(exprA, { data: dataA })).toMatchObject({ rate: 0.61 })
    expect(http.callCount).toBe(1)
  })

  it('step 4 — B as a fresh object of the same content: still nothing', async () => {
    expect(await lifecycle.evaluate(exprB2, { data: { tier: 'silver' } })).toEqual([
      'standard-support',
    ])
    expect(http.callCount).toBe(1)
  })

  it('step 5 — different data forks the entry; the gold branch runs at last', async () => {
    expect(
      await lifecycle.evaluate(exprA, {
        data: { currency: 'AUD', team: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Alan' }] },
      })
    ).toMatchObject({ team: 'Ada, Grace, Alan', rate: 0.7301 })
    // A different resolved query is a different effective request
    expect(http.callCount).toBe(2)

    expect(await lifecycle.evaluate(exprB2, { data: { tier: 'gold' } })).toEqual([
      'priority-support',
      'swag',
    ])
    expect(http.callCount).toBe(3)
  })

  it('step 6 — operatorDefaults recompiles without refetching', async () => {
    compiles.reset()
    lifecycle.updateOptions({ operatorDefaults: { join: { delimiter: ' | ' } } })
    expect(await lifecycle.evaluate(exprA, { data: dataA })).toMatchObject({
      team: 'Ada | Grace',
      rate: 0.61,
    })
    // Both parse layers dropped; the result store is untouched, because
    // its keys derive from resolved requests and no option default
    // reaches them
    expect(compiles.compiles()).toBe(1)
    expect(http.callCount).toBe(3)
  })

  it('step 6, the coda — clearCache() refetches without recompiling', async () => {
    compiles.reset()
    lifecycle.clearCache()
    expect(await lifecycle.evaluate(exprA, { data: dataA })).toMatchObject({ rate: 0.61 })
    // The exact mirror image of the step above
    expect(compiles.compiles()).toBe(0)
    expect(http.callCount).toBe(4)
  })
})

/**
 * Worked example 3 in full (docs-dev/v3-specs/v3-worked-examples.md § 3) —
 * timeout shielding in throw mode, and the validate badge. The two
 * report-mode lines are Phase 12.
 *
 * The doc's request takes ~900ms against a 50ms budget; the mock's latency
 * is shorter so the suite stays quick, and the relationship is what matters.
 */
describe('worked example 3 — timeout shielding: throw mode and the validate badge', () => {
  const http = new MockHttpClient({ latencyMs: 300, responses: { offers: [{ id: 7 }] } })
  const fig = new FigTree({ operators: [coreOperators, httpOperators(http)] })

  const banner = {
    greeting: { $buildString: ['Hi %1', '$data.name'], fallback: 'Hi there' },
    offers: { operator: 'http', url: 'https://api.example.com/offers', fallback: [] },
  }
  const banner2 = { ...banner, offers: { ...banner.offers, fallback: '$data.cachedOffers' } }

  it('every hole root carries a static fallback, so validate badges it shielded', () => {
    expect(fig.validate(banner)).toEqual({ valid: true, issues: [], timeoutShielded: true })
  })

  it('under the budget, greeting contributes its real value and offers its static fallback', async () => {
    expect(await fig.evaluate(banner, { data: { name: 'Ada' }, timeout: 50 })).toEqual({
      greeting: 'Hi Ada',
      offers: [],
    })
    // The request went out, and — failures never being cached — goes out
    // again when there is time for it: the fallback was the deadline's
    expect(http.callCount).toBe(1)
    expect(await fig.evaluate(banner, { data: { name: 'Ada' } })).toEqual({
      greeting: 'Hi Ada',
      offers: [{ id: 7 }],
    })
    expect(http.callCount).toBe(2)
  })

  it('one dynamic fallback un-shields the whole expression: the badge flips, the timeout throws', async () => {
    expect(fig.validate(banner2)).toEqual({ valid: true, issues: [], timeoutShielded: false })
    // The step above left the offers in the result cache, and a cache hit
    // cannot time out: the request the deadline is meant to cut off has to
    // be in flight
    expect(await fig.evaluate(banner2, { data: { name: 'Ada' }, timeout: 50 })).toEqual({
      greeting: 'Hi Ada',
      offers: [{ id: 7 }],
    })
    fig.clearCache()
    const error = await rejection<FigTreeError>(
      fig.evaluate(banner2, { data: { name: 'Ada' }, timeout: 50 })
    )
    expect(error.code).toBe('timeout')
  })

  it.todo('report mode returns the assembly beside exactly [timeoutError] (Phase 12)')
  it.todo('report mode returns null beside the timeout error for the un-shielded banner (Phase 12)')
})
