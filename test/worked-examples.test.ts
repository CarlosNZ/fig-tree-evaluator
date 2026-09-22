/**
 * Worked example 1 in full (docs-dev/v3-specs/v3-worked-examples.md § 1)
 * — Phase 12.1's acceptance test.
 *
 * One config, five holes, five different fates: plain success, success
 * via the null gradient, designed degradation (a `fallback` catches), a
 * deep uncaught failure, and a failing fallback. The two modes agree on
 * everything except what happens AFTER an uncaught failure, which is the
 * whole point of the example.
 *
 * Only the behaviours are asserted, never the encodings — the doc's own
 * reading rule. One divergence from the doc's printed output, first met
 * at Phase 7 and worth stating: `10 / 0` is stopped by the engine's
 * finite-number guard, so the code is `non-finite-result` rather than the
 * `operator-failure` the example shows, and the message is the guard's.
 * The path, the hole and the fate are as written.
 */
import { FigTree, FigTreeError, ErrorCodes, httpOperators } from '../src'
import type { EvaluationResult } from '../src'
import { coreOperators } from '../src/operators'
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

  const run = async (): Promise<EvaluationResult> =>
    (await build().evaluate(dashboard, { mode: 'report', data })) as EvaluationResult

  it('keeps the three healthy values and degrades the two that failed', async () => {
    const { result } = await run()
    expect(result).toEqual({
      meta: { generated: 'v3-example', version: 3 },
      user: {
        // null rendered '' — success via the gradient, no error
        displayName: 'Ada ',
        // the node's own fallback caught — success, no error
        avatar: 'https://api.example.com/avatar/default.png',
      },
      stats: {
        total: 10,
        summary: null, // degraded hole
      },
      activity: null, // degraded hole
    })
  })

  it('collects exactly the two uncaught failures, in tree order', async () => {
    const { errors } = await run()
    expect(errors).toHaveLength(2)
    expect(errors.map((error) => error.holePath)).toEqual([['stats', 'summary'], ['activity']])
  })

  it('the deep failure names the failing node and the hole that degraded', async () => {
    const { errors } = await run()
    const [summary] = errors
    expect(summary.code).toBe(ErrorCodes.nonFiniteResult)
    expect(summary.operator).toBe('divide')
    // The failing node — two levels below the hole root, with no fallback
    // anywhere between
    expect(summary.path).toEqual(['stats', 'summary', '$buildString', 1])
    expect(summary.holePath).toEqual(['stats', 'summary'])
  })

  it('the failing fallback reports the fallback’s error, the original as `cause`', async () => {
    const { errors } = await run()
    const activity = errors[1]
    expect(activity.operator).toBe('http')
    // `path` names the node that FAILED, which under rule 4 is the
    // fallback — the doc prints `['activity']` for both ends, which the
    // engine cannot produce and should not: re-tagging a path a child
    // already set is exactly what "first tagger wins" forbids, and it is
    // that rule which makes the deep `summary` path above work. The pair
    // is more legible for keeping them apart — `cause` names the primary
    // node, `path` the backup that also failed — and `holePath` is what
    // answers "which hole degraded" either way
    expect(activity.path).toEqual(['activity', 'fallback'])
    expect(activity.holePath).toEqual(['activity'])
    expect(activity.message).toMatch(/backup\.example\.com/)
    expect(activity.errorData).toMatchObject({ status: 503 })
    const cause = activity.cause as FigTreeError
    expect(cause.message).toMatch(/api\.example\.com/)
  })

  it('the caught fallback and the propagated null contribute nothing to `errors`', async () => {
    const { errors } = await run()
    const paths = errors.map((error) => JSON.stringify(error.holePath))
    expect(paths).not.toContain(JSON.stringify(['user', 'avatar']))
    expect(paths).not.toContain(JSON.stringify(['user', 'displayName']))
  })

  it('throw mode rejects with one of the two, and destroys the healthy values', async () => {
    const error = await rejection<FigTreeError>(build().evaluate(dashboard, { data }))
    // Whichever occurred first — the divide, in practice, there being no
    // network round trip — so membership is what is asserted, not identity
    const { errors } = await run()
    expect(errors.map((collected) => collected.code)).toContain(error.code)
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
 * stories — one dropping both caches, the other the result store alone.
 * Not asserted: the cache-key encoding, which the doc marks illustrative.
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

  it('step 6 — operatorDefaults recompiles AND refetches', async () => {
    compiles.reset()
    lifecycle.updateOptions({ operatorDefaults: { join: { delimiter: ' | ' } } })
    expect(await lifecycle.evaluate(exprA, { data: dataA })).toMatchObject({
      team: 'Ada | Grace',
      rate: 0.61,
    })
    // Both compile-cache layers dropped, and the result generation moved
    // on with them (#174): a result key names the operator and its
    // resolved request, nothing of the definition, so the store cannot
    // tell a result the old registry computed from one the new one would
    expect(compiles.compiles()).toBe(1)
    expect(http.callCount).toBe(4)
  })

  it('step 6, the coda — clearCache() refetches without recompiling', async () => {
    compiles.reset()
    lifecycle.clearCache()
    expect(await lifecycle.evaluate(exprA, { data: dataA })).toMatchObject({ rate: 0.61 })
    // The result half of the step above, on its own
    expect(compiles.compiles()).toBe(0)
    expect(http.callCount).toBe(5)
  })
})

/**
 * Worked example 3 in full (docs-dev/v3-specs/v3-worked-examples.md § 3) —
 * timeout shielding in throw mode, and the validate badge. The two
 * report-mode lines are Phase 12.
 *
 * The doc's request takes ~900ms against a 50ms budget; the mock's latency
 * is shorter so the suite stays quick, and the relationship is what matters.
 *
 * Report mode's two rows close the example at Phase 12: shielding is the
 * one place the modes disagree about a SUCCESS, since throw mode returns
 * the assembly silently and report mode says the deadline fired.
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

  it('report mode returns the assembly beside exactly [timeoutError]', async () => {
    // A cache hit cannot time out: the request the deadline is meant to
    // cut off has to be in flight
    fig.clearCache()
    const { result, errors } = (await fig.evaluate(banner, {
      data: { name: 'Ada' },
      timeout: 50,
      mode: 'report',
    })) as EvaluationResult
    expect(result).toEqual({ greeting: 'Hi Ada', offers: [] })
    // Exactly [timeoutError] — a shielded expression CANNOT have other
    // uncaught errors, since every hole root's fallback catches
    // everything inside its own hole
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe(ErrorCodes.timeout)
  })

  it('report mode returns null beside the timeout error for the un-shielded banner', async () => {
    fig.clearCache()
    const { result, errors } = (await fig.evaluate(banner2, {
      data: { name: 'Ada' },
      timeout: 50,
      mode: 'report',
    })) as EvaluationResult
    // All-or-nothing: greeting's finished value is discarded with the rest
    expect(result).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe(ErrorCodes.timeout)
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

  test('under report, the call degrades and the error keeps BOTH ends of the pointer', async () => {
    const { result, errors } = (await fig().evaluate(expression, {
      mode: 'report',
      data: { user: { name: 'Ada', roles: 7 } },
    })) as EvaluationResult
    expect(result).toEqual({ banner: null })
    expect(errors).toHaveLength(1)
    const [error] = errors
    expect(error.code).toBe(ErrorCodes.typeCheck)
    // The call node, in the input — and the hole it degraded, which for a
    // fragment call is the call node too
    expect(error.path).toEqual(['banner'])
    expect(error.holePath).toEqual(['banner'])
    // …and where in the registered body it actually went wrong
    expect(error.fragment).toBe('userSummary')
    expect(error.fragmentPath).toEqual(['expression', '$buildString', 2])
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
 * parked failure never reaches report output. Only when nothing decides
 * does the result depend on the failure.
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

  const run = async (isAdmin: boolean): Promise<EvaluationResult> =>
    (await build().evaluate(canEdit, { mode: 'report', data: { isAdmin } })) as EvaluationResult

  test('run 1 — operand 0 decides, so the failure is discarded entirely', async () => {
    const { result, errors } = await run(true)
    expect(result).toBe(true)
    // Cancellation is not failure, and neither is a parked failure that
    // lost the race
    expect(errors).toEqual([])
  })

  test('run 2 — with no decider the result depends on it, so the node fails', async () => {
    const { result, errors } = await run(false)
    expect(result).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].operator).toBe('http')
    expect(errors[0].holePath).toEqual([])
  })

  test('throw mode agrees on both runs — the invariant, on the example', async () => {
    expect(await build().evaluate(canEdit, { data: { isAdmin: true } })).toBe(true)
    const error = await rejection<FigTreeError>(
      build().evaluate(canEdit, { data: { isAdmin: false } })
    )
    expect(error.operator).toBe('http')
  })
})
