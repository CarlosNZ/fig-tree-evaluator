/**
 * Claim 6 — memoized I/O steady state: "O(1) parse lookup + O(holes) work
 * + memoized I/O", the fetch-count walkthrough in
 * docs-dev/v3-specs/v3-worked-examples.md.
 *
 * Both engines take an injected client, so both run against a
 * zero-latency stub and network variance never enters. That makes the
 * timing table the less interesting half by construction: with a stub
 * that returns instantly, a memoized request and a repeated one cost
 * almost the same, and any real deployment's saving is three orders of
 * magnitude larger than anything here. The request counts underneath are
 * the actual measurement — they are what a caller is promised.
 *
 * Two rows, because the promise has a boundary. A request whose inputs
 * are fixed should go out once however often the expression runs; one
 * whose URL is built from changing data must go out every time, and a
 * cache that served the first from a stale entry would be a bug rather
 * than a saving.
 */
import { FigTreeEvaluator } from '../v2-src'
import { FigTree, coreOperators, httpOperators } from '../src'
import type { HttpClient } from '../src'
import { finish, note, runCase, section, type Sweep } from './harness'

const RESPONSE = { rate: 0.61 }

/** v3's client: one `request` method. Counts what it was asked for. */
const v3Client = () => {
  const calls: string[] = []
  const client: HttpClient = {
    request: async (req) => {
      calls.push(req.url)
      return RESPONSE
    },
  }
  return { client, calls }
}

/** v2's client: `get` / `post` / `throwError`. */
const v2Client = () => {
  const calls: string[] = []
  const client = {
    get: async (req: { url: string }) => {
      calls.push(req.url)
      return RESPONSE
    },
    post: async (req: { url: string }) => {
      calls.push(req.url)
      return RESPONSE
    },
    throwError: (err: unknown) => {
      throw err
    },
  }
  return { client, calls }
}

const URL = 'https://example.test/rates'

/** Fixed inputs: one request should serve every evaluation. */
const fixedV3 = { $http: { url: URL, query: { base: 'NZD' }, returnPath: 'rate' } }
const fixedV2 = {
  operator: 'GET',
  url: URL,
  parameters: { base: 'NZD' },
  returnProperty: 'rate',
}

/** Data-driven URL: a different request every evaluation, by construction. */
const movingV3 = {
  $http: { url: URL, query: { base: '$data.currency' }, returnPath: 'rate' },
}
const movingV2 = {
  operator: 'GET',
  url: URL,
  parameters: { base: { operator: 'objectProperties', property: 'currency' } },
  returnProperty: 'rate',
}

const CURRENCIES = ['NZD', 'AUD', 'USD', 'GBP', 'FJD']
const data = (i: number) => ({ currency: CURRENCIES[i % CURRENCIES.length] })

const newV2 = () => new FigTreeEvaluator({ httpClient: v2Client().client, useCache: true })
const newV3 = () => new FigTree({ operators: [coreOperators, httpOperators(v3Client().client)] })

const v2 = newV2()
const v3 = newV3()

const row = (label: string, treeV2: object, treeV3: object, iterations: number) => ({
  label,
  iterations,
  arms: {
    v2: (i: number) => v2.evaluate(treeV2, { data: data(i) }),
    'v3 identity': (i: number) => v3.evaluate(treeV3, { data: data(i) }),
    'v3 content': (i: number) => v3.evaluate({ ...treeV3 }, { data: data(i) }),
    'v3 cold': (i: number) => newV3().evaluate(treeV3, { data: data(i) }),
  },
})

const sweep: Sweep = {
  title: 'I/O against a zero-latency stub',
  note: 'Timings are the lesser half here — the request counts below are the claim.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [['v2', 'v3 identity']],
}

/** Requests actually issued over `runs` evaluations, per arm, freshly built. */
const counts = async (treeV2: object, treeV3: object, runs: number) => {
  const v2Stub = v2Client()
  const held = new FigTreeEvaluator({ httpClient: v2Stub.client, useCache: true })
  for (let i = 0; i < runs; i++) await held.evaluate(treeV2, { data: data(i) })

  const v3Stub = v3Client()
  const heldV3 = new FigTree({ operators: [coreOperators, httpOperators(v3Stub.client)] })
  for (let i = 0; i < runs; i++) await heldV3.evaluate(treeV3, { data: data(i) })

  const coldStub = v3Client()
  for (let i = 0; i < runs; i++) {
    const fresh = new FigTree({ operators: [coreOperators, httpOperators(coldStub.client)] })
    await fresh.evaluate(treeV3, { data: data(i) })
  }

  return { v2: v2Stub.calls.length, v3: v3Stub.calls.length, cold: coldStub.calls.length }
}

const main = async () => {
  section(sweep)
  await runCase(sweep, row('fixed URL', fixedV2, fixedV3, 2000))
  await runCase(sweep, row('URL built from data', movingV2, movingV3, 2000))

  const runs = 100
  const fixed = await counts(fixedV2, fixedV3, runs)
  const moving = await counts(movingV2, movingV3, runs)
  note(
    `Requests issued over ${runs} evaluations —\n` +
      `  fixed URL:           v2 ${fixed.v2}, v3 ${fixed.v3}, v3 cold ${fixed.cold}\n` +
      `  URL built from data: v2 ${moving.v2}, v3 ${moving.v3}, v3 cold ${moving.cold}` +
      `  (${CURRENCIES.length} distinct URLs)`
  )
  finish()
}

main()
