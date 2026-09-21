/**
 * Claim 7 — boolean short-circuit and cancellation: "all predicates start
 * concurrently; the node resolves at the first index whose predicate is
 * truthy once every earlier predicate is known falsy, cancelling the
 * rest" ("Deterministic error semantics" in
 * docs-dev/v3-specs/v3-operator-parameters.md).
 *
 * Unlike branch laziness, which turned out to be parity, this is a real
 * difference: v2's AND and OR hand the whole `values` array to
 * `evaluateArray` and reduce over the results, so every operand runs
 * whatever the first one said.
 *
 * Cancellation can only take effect at an await, so the operands here are
 * deep operator trees — asynchronous all the way down — rather than a
 * synchronous burn, which nothing could interrupt. Mocked I/O would hide
 * the effect entirely at zero latency, which is why it is not used.
 *
 * Three rows, and the two controls matter as much as the subject. When
 * the decider comes first, v3 may abandon the rest and v2 may not. When
 * it comes last, or when there is no decider at all, both engines must
 * evaluate everything — so those rows should show no v3 advantage, and if
 * they did, the subject row would be measuring something else.
 *
 * The second sweep exists because the first one found nothing. Operator
 * trees resolve through microtasks without ever yielding, so the operands
 * are finished before a cancellation could reach them and the subject row
 * matches its own controls. Sweep 2 gives each operand a real await to be
 * abandoned at — a stub client on a fixed 2 ms timer. That is a
 * deterministic delay, not network variance, so it is the one place I/O
 * belongs in this phase: without it the claim cannot be tested at all,
 * and with a *varying* delay it could not be measured.
 */
import { FigTreeEvaluator } from '../v2-src'
import { FigTree, coreOperators, httpOperators } from '../src'
import type { HttpClient } from '../src'
import { finish, note, runCase, section, type Sweep } from './harness'

/** An operand costly enough to notice being skipped: 20 nested sums. */
const costlyV3 = () => ({
  $greaterThan: [{ $plus: Array.from({ length: 20 }, () => ({ $plus: ['$data.a', 1] })) }, 0],
})

const costlyV2 = () => ({
  operator: 'greaterThan',
  values: [
    {
      operator: 'plus',
      values: Array.from({ length: 20 }, () => ({
        operator: 'plus',
        values: [{ operator: 'objectProperties', property: 'a' }, 1],
      })),
    },
    0,
  ],
})

const andV3 = (operands: unknown[]) => ({ $and: operands })
const andV2 = (values: unknown[]) => ({ operator: 'and', values })

const data = (i: number) => ({ a: i % 7 })

const v2 = new FigTreeEvaluator({ evaluateFullObject: true })
const v3 = new FigTree({ operators: [coreOperators] })

const row = (label: string, treeV2: object, treeV3: object, iterations: number) => ({
  label,
  iterations,
  arms: {
    v2: (i: number) => v2.evaluate(treeV2, { data: data(i) }),
    'v3 identity': (i: number) => v3.evaluate(treeV3, { data: data(i) }),
    'v3 content': (i: number) => v3.evaluate({ ...treeV3 }, { data: data(i) }),
    'v3 cold': (i: number) =>
      new FigTree({ operators: [coreOperators] }).evaluate(treeV3, { data: data(i) }),
  },
})

const three = [0, 1, 2]

const sweep: Sweep = {
  title: 'and() over three costly operands, with a decider that may end it early',
  note: 'The claim: v3 abandons operands once decided. The controls must show no advantage.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [['v2', 'v3 identity']],
}

// ── Operands that actually wait ────────────────────────────────────────

const DELAY_MS = 2

const slowV3Client: HttpClient = {
  request: async () => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
    return { ok: true }
  },
}

const slowV2Client = {
  get: async () => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
    return { ok: true }
  },
  post: async () => ({ ok: true }),
  throwError: (err: unknown) => {
    throw err
  },
}

// The URL comes from data and changes every iteration, so neither engine's
// result cache can serve the request — without that, a repeated evaluation
// measures a cache hit and the waiting never happens at all.
const slowV3 = (n: number) => ({ $http: { url: `$data.url${n}`, returnPath: 'ok' } })
const slowV2 = (n: number) => ({
  operator: 'GET',
  url: { operator: 'objectProperties', property: `url${n}` },
  returnProperty: 'ok',
})

const slowData = (i: number) =>
  Object.fromEntries(three.map((n) => [`url${n}`, `https://example.test/slow/${i}/${n}`]))

const v2slow = new FigTreeEvaluator({ httpClient: slowV2Client })
const v3slow = new FigTree({ operators: [coreOperators, httpOperators(slowV3Client)] })

const slowRow = (label: string, treeV2: object, treeV3: object, iterations: number) => ({
  label,
  iterations,
  arms: {
    v2: (i: number) => v2slow.evaluate(treeV2, { data: slowData(i) }),
    'v3 identity': (i: number) => v3slow.evaluate(treeV3, { data: slowData(i) }),
    'v3 content': (i: number) => v3slow.evaluate({ ...treeV3 }, { data: slowData(i) }),
    'v3 cold': (i: number) =>
      new FigTree({ operators: [coreOperators, httpOperators(slowV3Client)] }).evaluate(treeV3, {
        data: slowData(i),
      }),
  },
})

const waiting: Sweep = {
  title: `and() over three operands that each wait ${DELAY_MS} ms`,
  note: 'With a real await to abandon, a decided node should not pay for the rest.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [['v2', 'v3 identity']],
}

const main = async () => {
  section(sweep)
  await runCase(
    sweep,
    row(
      'false first (v3 may cancel)',
      andV2([false, ...three.map(costlyV2)]),
      andV3([false, ...three.map(costlyV3)]),
      400
    )
  )
  await runCase(
    sweep,
    row(
      'false last (nothing to skip)',
      andV2([...three.map(costlyV2), false]),
      andV3([...three.map(costlyV3), false]),
      400
    )
  )
  await runCase(
    sweep,
    row('all true (control)', andV2(three.map(costlyV2)), andV3(three.map(costlyV3)), 400)
  )

  section(waiting)
  await runCase(
    waiting,
    slowRow(
      'false first (v3 may cancel)',
      andV2([false, ...three.map((n) => slowV2(n))]),
      andV3([false, ...three.map((n) => slowV3(n))]),
      60
    )
  )
  await runCase(
    waiting,
    slowRow(
      'all true (control)',
      andV2(three.map((n) => slowV2(n))),
      andV3(three.map((n) => slowV3(n))),
      60
    )
  )
  note(
    `Each operand waits ${DELAY_MS} ms, and the three run concurrently, ` +
      `so paying for all of them is about ${DELAY_MS} ms.`
  )
  finish()
}

main()
