/**
 * Worked example 1 in full (docs-dev/v3-specs/v3-worked-examples.md § 1).
 *
 * One config, five holes, five different fates: plain success, success
 * via the null gradient, designed degradation (a `fallback` catches), a
 * deep uncaught failure, and a failing fallback. As authored it rejects;
 * with a fallback on each field that can fail, every value survives.
 *
 * Only the behaviours are asserted, never the encodings — the doc's own
 * reading rule. Each uncaught failure is asserted with the other one
 * covered, since which of the two rejects the uncovered config is the one
 * timing-dependent thing in the example.
 */
import { FigTree, FigTreeError, ErrorCodes, httpOperators } from '../src'
import { coreOperators } from '../src/operators'
import { fallbackCoverage } from '../src/authoring'
import { MockHttpClient } from './helpers'
import { rejection } from './helpers/rejection'
import { compileSpyOp } from './fixtures/evalOperators'
import type { FragmentDefinition } from '../src'

describe('worked example 1 — failures at different depths, different fates', () => {
  // Every API in the example is down: the avatar, the activity feed, and
  // the activity feed's backup
  const build = () => {
    const http = new MockHttpClient({ failStatus: 503 })
    return new FigTree({ operators: [coreOperators, httpOperators(http)] })
  }

  const dashboard = {
    meta: { generated: 'v3-example', version: 3 }, // constant subtree — not a hole
    user: {
      displayName: { $buildString: ['%1 %2', '$data.user.first', '$data.user.last'] },
      avatar: {
        operator: 'http',
        url: { $buildString: ['https://api.example.com/avatar/%1', '$data.user.id'] },
        fallback: 'https://api.example.com/avatar/default.png',
      },
    },
    stats: {
      total: { $plus: ['$data.stats.wins', '$data.stats.losses'] },
      summary: {
        $buildString: ['Win ratio: %1', { $divide: ['$data.stats.wins', '$data.stats.losses'] }],
      },
    },
    activity: {
      operator: 'http',
      url: 'https://api.example.com/activity',
      // A dynamic fallback — a backup call, which is also down
      fallback: { operator: 'http', url: 'https://backup.example.com/activity' },
    },
  }

  // `user.last` is missing; wins 10, losses 0
  const data = { user: { first: 'Ada', id: 42 }, stats: { wins: 10, losses: 0 } }

  /** The dashboard with fallbacks on `summary`, `activity`'s backup, or both */
  const covered = (fields: { summary?: boolean; activity?: boolean }) => ({
    ...dashboard,
    stats: {
      ...dashboard.stats,
      summary: fields.summary
        ? { ...dashboard.stats.summary, fallback: 'Win ratio: n/a' }
        : dashboard.stats.summary,
    },
    activity: fields.activity
      ? { ...dashboard.activity, fallback: { ...dashboard.activity.fallback, fallback: [] } }
      : dashboard.activity,
  })

  const run = (expression: unknown) => build().evaluate(expression, { data })

  it('as authored, an uncaught failure rejects the whole call', async () => {
    const error = await rejection<FigTreeError>(run(dashboard))
    // Whichever occurred first — the divide, in practice, there being no
    // network round trip — so membership is what is asserted, not identity
    expect([ErrorCodes.nonFiniteResult, ErrorCodes.operatorFailure]).toContain(error.code)
  })

  it('the deep failure names the failing node', async () => {
    const error = await rejection<FigTreeError>(run(covered({ activity: true })))
    expect(error.code).toBe(ErrorCodes.nonFiniteResult)
    expect(error.operator).toBe('divide')
    // Two levels below the field, with no fallback anywhere between
    expect(error.path).toEqual(['stats', 'summary', '$buildString', 1])
  })

  it('the failing fallback raises the fallback’s error, the original as `cause`', async () => {
    const error = await rejection<FigTreeError>(run(covered({ summary: true })))
    expect(error.operator).toBe('http')
    // `path` names the node that FAILED, which under rule 4 is the
    // fallback: re-tagging a path a child already set is exactly what
    // "first tagger wins" forbids, and it is that rule which makes the
    // deep `summary` path above work. `cause` names the primary node,
    // `path` the backup that also failed
    expect(error.path).toEqual(['activity', 'fallback'])
    expect(error.message).toMatch(/backup\.example\.com/)
    expect(error.errorData).toMatchObject({ status: 503 })
    const cause = error.cause as FigTreeError
    expect(cause.message).toMatch(/api\.example\.com/)
  })

  it('with a fallback on each field that can fail, every value survives', async () => {
    expect(await run(covered({ summary: true, activity: true }))).toEqual({
      meta: { generated: 'v3-example', version: 3 },
      user: {
        // null rendered '' — success via the gradient
        displayName: 'Ada ',
        // the node's own fallback caught — success
        avatar: 'https://api.example.com/avatar/default.png',
      },
      stats: { total: 10, summary: 'Win ratio: n/a' },
      activity: [],
    })
  })

  it("the gradient's opt-outs close the trailing space, and fallback is not one of them", async () => {
    const fig = build()
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
})

/**
 * Worked example 2 — the full lifecycle, as far as Phase 8 can carry it
 * (docs-dev/v3-specs/v3-worked-examples.md § 2).
 *
 * The example runs two expressions across one instance and asserts two
 * things per step: how many times the compile cache compiled, and how many
 * times the mock client fetched. Only the first half is reachable here —
 * the clients and the I/O operators are Phase 9, which is where the fetch
 * counts and the M4 milestone live. So the `http` node is stood in for by
 * a counted operator, and the steps are read for cache behaviour alone.
 *
 * Run as one sequence rather than independent cases, because the point of
 * the example is the state carried from step to step.
 */
describe('lifecycle — two expressions, one instance, the compile half', () => {
  const spy = compileSpyOp('rate')
  const fig = new FigTree({
    operators: [coreOperators, spy.definition],
    operatorDefaults: { join: { delimiter: ', ' } },
  })

  const exprA = {
    greeting: { $buildString: ['Welcome to %1', '$data.org'] },
    team: { $join: '$data.team[*].name' },
    rate: { $rate: '$data.currency' },
  }
  // Per-call data replaces rather than merging, so the shared `org` rides
  // in every call's block
  const dataA = { org: 'Acme', currency: 'NZD', team: [{ name: 'Ada' }, { name: 'Grace' }] }
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
      await fig.evaluate(exprA, {
        data: { org: 'Acme', currency: 'AUD', team: [{ name: 'Alan' }] },
      })
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
  // compiled, evaluated or fetched
  const lifecycle = new FigTree({
    operators: [coreOperators, httpOperators(http), compiles.definition],
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
  const dataA = { org: 'Acme', currency: 'NZD', team: [{ name: 'Ada' }, { name: 'Grace' }] }

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

  it('step 1 — A: the call’s data is read whole, and one fetch fires', async () => {
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
        data: {
          org: 'Acme',
          currency: 'AUD',
          team: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Alan' }],
        },
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
    // Both compile-cache layers dropped; the result store is untouched, because
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
 * timeout shielding, and what `fallbackCoverage` reports of it.
 *
 * The doc's request takes ~900ms against a 50ms budget; the mock's latency
 * is shorter so the suite stays quick, and the relationship is what matters.
 */
describe('worked example 3 — timeout shielding and fallbackCoverage', () => {
  const http = new MockHttpClient({ latencyMs: 300, responses: { offers: [{ id: 7 }] } })
  const fig = new FigTree({ operators: [coreOperators, httpOperators(http)] })
  // The analysis reads the timeout from the instance it is given
  const timed = new FigTree({ operators: [coreOperators, httpOperators(http)], timeout: 50 })

  const banner = {
    greeting: { $buildString: ['Hi %1', '$data.name'], fallback: 'Hi there' },
    offers: { operator: 'http', url: 'https://api.example.com/offers', fallback: [] },
  }
  const banner2 = { ...banner, offers: { ...banner.offers, fallback: '$data.cachedOffers' } }

  it('every hole root carries a static fallback, so none is uncovered under a timeout', async () => {
    expect((await fallbackCoverage(timed, banner)).uncovered).toEqual([])
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

  it('one dynamic fallback un-shields the whole expression: its hole is listed, the timeout throws', async () => {
    expect((await fallbackCoverage(timed, banner2)).uncovered).toEqual([
      expect.objectContaining({ path: ['offers'], code: 'timeout' }),
    ])
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
})

// ═══════════════════════════════════════════════════════════════════

// ── Worked example 4 ────────────────────────────────────────────────

describe('worked example 4 — a failure inside a fragment body', () => {
  const build = (fragments: Record<string, FragmentDefinition>) =>
    new FigTree({ operators: [coreOperators], fragments })

  // The example's `$lower` has no v3 counterpart; `join` stands in as a
  // typed operator fed from `$params` that renders to a string. `roles` is
  // declared `any` deliberately: a declared `array` would be refused by the
  // ARGUMENT check at the call boundary, and the failure would never reach
  // the body at all — which is the one correction this example needs
  const fig = () =>
    build({
      userSummary: {
        expression: {
          $buildString: [
            '%1 (%2)',
            '$params.name',
            { $join: { values: '$params.roles', delimiter: ', ' } },
          ],
        },
        parameters: { name: { type: 'string' }, roles: { type: 'any', default: ['member'] } },
      },
    })

  const expression = {
    banner: { $userSummary: { name: '$data.user.name', roles: '$data.user.roles' } },
  }

  test('the happy path', async () => {
    const result = await fig().evaluate(expression, {
      data: { user: { name: 'Ada', roles: ['admin', 'ops'] } },
    })
    expect(result).toEqual({ banner: 'Ada (admin, ops)' })
  })

  test('a body failure names the call in the input and the node in the body', async () => {
    const error = await rejection<FigTreeError>(
      fig().evaluate(expression, { data: { user: { name: 'Ada', roles: 7 } } })
    )
    expect(error.code).toBe(ErrorCodes.typeCheck)
    expect(error.operator).toBe('join')
    // The call node, in the input — resolvable without asking whether a
    // fragment was involved
    expect(error.path).toEqual(['banner'])
    expect(error.fragment).toBe('userSummary')
    expect(error.fragmentPath).toEqual(['expression', '$buildString', 2])
  })

  test('a literal argument of the wrong type is a validate-time error instead', () => {
    const strict = build({
      frag: { expression: '$params.role', parameters: { role: { type: 'string' } } },
    })
    expect(strict.validate({ $frag: { role: 7 } }).issues[0].code).toBe(ErrorCodes.typeCheck)
  })
})

// ── Worked example 5 ────────────────────────────────────────────────

/**
 * Worked example 5 (docs-dev/v3-specs/v3-worked-examples.md § 5) — Kleene
 * parking in `or`: the same failure, mattering and not mattering.
 *
 * The teaching point is that run 1's outcome is deterministic regardless
 * of completion order. Even where the request has already failed before
 * `isAdmin` resolves, `or(parked-failure, true)` is `true`, and the
 * parked failure never surfaces. Only when nothing decides does the
 * result depend on the failure.
 */
describe('worked example 5 — the same failure, mattering and not mattering', () => {
  const canEdit = {
    $or: [
      '$data.isAdmin',
      {
        operator: 'http',
        url: 'https://api.example.com/permissions/42',
        returnPath: 'canEdit',
      },
    ],
  }

  // The permissions API is down in both runs
  const build = () =>
    new FigTree({
      operators: [coreOperators, httpOperators(new MockHttpClient({ failStatus: 503 }))],
    })

  const run = (isAdmin: boolean) => build().evaluate(canEdit, { data: { isAdmin } })

  test('run 1 — operand 0 decides, so the failure is discarded entirely', async () => {
    // Cancellation is not failure, and neither is a parked failure that
    // lost the race
    expect(await run(true)).toBe(true)
  })

  test('run 2 — with no decider the result depends on it, so the node fails', async () => {
    const error = await rejection<FigTreeError>(run(false))
    expect(error.operator).toBe('http')
    expect(error.path).toEqual(['$or', 1])
  })
})
