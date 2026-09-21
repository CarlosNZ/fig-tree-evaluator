/**
 * Chunk 9.3 — I/O result caching on effective-request keys (ledger #16 in
 * docs-dev/v3-specs/v3-operator-parameters.md; "Caching" in Batch 8 of
 * docs-dev/v3-specs/v3-operator-parameters-2.md).
 *
 * The rule the three operators share: the memo unit is everything that can
 * fail because of the network or the driver, and pure reshaping of a
 * successful payload sits outside it. So two spellings of one request
 * share an entry, and `returnPath` / `shape` never fork one.
 *
 * Asserted as counts and keys, per the worked examples: the client's call
 * count for what actually went out, the recording store's log for which
 * keys were touched.
 */
import { FigTree, coreOperators, httpOperators, sqlOperators } from '../src'
import { MockHttpClient, MockSqlConnection, RecordingCacheStore } from './helpers'

const rig = (options: object = {}) => {
  // One payload serving both operators, since one client does: `data` is
  // what graphQL unwraps, the rest is what http drills
  const http = new MockHttpClient({
    defaultResponse: { rate: 0.61, base: 'USD', data: { ok: true } },
  })
  const sql = new MockSqlConnection({ defaultRows: [{ name: 'Ada' }, { name: 'Grace' }] })
  const store = new RecordingCacheStore()
  const fig = new FigTree({
    operators: [coreOperators, httpOperators(http), sqlOperators(sql)],
    cache: { store },
    ...options,
  })
  return { fig, http, sql, store }
}

describe('two spellings of one request share one entry', () => {
  it('across the positional and named faces', async () => {
    const { fig, http, store } = rig()
    await fig.evaluate({ $http: 'https://api.test/rates' })
    await fig.evaluate({ $http: { url: 'https://api.test/rates' } })
    await fig.evaluate({ operator: 'http', url: 'https://api.test/rates', method: 'get' })
    expect(http.callCount).toBe(1)
    expect(new Set(store.keysSet()).size).toBe(1)
  })

  it('across header ORDER, which is a set and not a sequence', async () => {
    const { fig, http } = rig()
    await fig.evaluate({ $http: { url: 'https://api.test/x', headers: { A: '1', B: '2' } } })
    await fig.evaluate({ $http: { url: 'https://api.test/x', headers: { B: '2', A: '1' } } })
    expect(http.callCount).toBe(1)
  })

  it('but not across a different header VALUE', async () => {
    const { fig, http } = rig()
    await fig.evaluate({ $http: { url: 'https://api.test/x', headers: { A: '1' } } })
    await fig.evaluate({ $http: { url: 'https://api.test/x', headers: { A: '2' } } })
    expect(http.callCount).toBe(2)
  })
})

describe('what sits outside the key', () => {
  it('returnPath — v2 refetched once per drill path', async () => {
    const { fig, http, store } = rig()
    expect(
      await fig.evaluate({ $http: { url: 'https://api.test/rates', returnPath: 'rate' } })
    ).toBe(0.61)
    expect(
      await fig.evaluate({ $http: { url: 'https://api.test/rates', returnPath: 'base' } })
    ).toBe('USD')
    expect(http.callCount).toBe(1)
    expect(new Set(store.keysSet()).size).toBe(1)
  })

  it('timeout — two nodes differing only in patience are one request', async () => {
    const { fig, http } = rig()
    await fig.evaluate({ $http: { url: 'https://api.test/x', timeout: 1000 } })
    await fig.evaluate({ $http: { url: 'https://api.test/x', timeout: 5000 } })
    expect(http.callCount).toBe(1)
  })

  it('sql shape and noRowDefault, for the same reason', async () => {
    const { fig, sql } = rig()
    await fig.evaluate({ $sql: ['SELECT name FROM people'] })
    await fig.evaluate({ $sql: { query: 'SELECT name FROM people', shape: 'column' } })
    await fig.evaluate({
      $sql: { query: 'SELECT name FROM people', shape: 'firstValue', noRowDefault: 'x' },
    })
    expect(sql.queryCount).toBe(1)
  })
})

describe('what forks the key', () => {
  it('a resolved value, so changing data forks entries naturally', async () => {
    const { fig, http } = rig()
    const expression = { $http: { url: 'https://api.test/rates', query: { currency: '$data.c' } } }
    await fig.evaluate(expression, { data: { c: 'NZD' } })
    await fig.evaluate(expression, { data: { c: 'AUD' } })
    await fig.evaluate(expression, { data: { c: 'NZD' } })
    expect(http.callCount).toBe(2)
    expect(http.calls.map((call) => call.url)).toEqual([
      'https://api.test/rates?currency=NZD',
      'https://api.test/rates?currency=AUD',
    ])
  })

  it('a rotated option, because it is part of the effective request', async () => {
    const { fig, http } = rig({ http: { baseEndpoint: 'https://one.test' } })
    await fig.evaluate({ $http: '/rates' })
    fig.updateOptions({ http: { baseEndpoint: 'https://two.test' } })
    await fig.evaluate({ $http: '/rates' })
    // The `'auto'` key would have gone stale here; keying the effective
    // request is what makes a rotated baseEndpoint miss correctly
    expect(http.callCount).toBe(2)
  })

  it('the operator, so http and graphQL never share an entry', async () => {
    const { fig, http } = rig({ graphQL: { endpoint: 'https://api.test/gql' } })
    await fig.evaluate({ $http: { url: 'https://api.test/gql', method: 'post', body: { a: 1 } } })
    await fig.evaluate({ $graphQL: 'query { a }' })
    expect(http.callCount).toBe(2)
  })
})

describe('gating and clearing', () => {
  it('a node opting out never touches the store', async () => {
    const { fig, http, store } = rig()
    await fig.evaluate({ operator: 'http', url: 'https://api.test/x', useCache: false })
    await fig.evaluate({ operator: 'http', url: 'https://api.test/x', useCache: false })
    expect(http.callCount).toBe(2)
    expect(store.log).toHaveLength(0)
  })

  it('a blanket useCache: false turns the whole instance off', async () => {
    const { fig, http } = rig({ useCache: false })
    await fig.evaluate({ $http: 'https://api.test/x' })
    await fig.evaluate({ $http: 'https://api.test/x' })
    expect(http.callCount).toBe(2)
  })

  it('clearCache() sends the next evaluation back to the wire', async () => {
    const { fig, http } = rig()
    await fig.evaluate({ $http: 'https://api.test/x' })
    await fig.evaluate({ $http: 'https://api.test/x' })
    expect(http.callCount).toBe(1)
    fig.clearCache()
    await fig.evaluate({ $http: 'https://api.test/x' })
    expect(http.callCount).toBe(2)
  })

  it('never caches a failure', async () => {
    const { fig } = rig()
    const failing = new MockHttpClient({ failStatus: 503, failMessage: 'Unavailable' })
    const figFail = new FigTree({ operators: [coreOperators, httpOperators(failing)] })
    await figFail.evaluate({ operator: 'http', url: 'https://api.test/x', fallback: null })
    await figFail.evaluate({ operator: 'http', url: 'https://api.test/x', fallback: null })
    expect(failing.callCount).toBe(2)
    expect(fig).toBeDefined()
  })
})

describe('what the cache deliberately does not do', () => {
  it('does not share an in-flight request between concurrent nodes', async () => {
    // No single-flight, deliberately: a shared promise would carry
    // whichever node's abort signal created it, so one node resolving
    // early would cancel the other's request. The entry is shared once the
    // first completes; the flight is not
    const { fig, http } = rig()
    await fig.evaluate({
      both: [{ $http: 'https://api.test/x' }, { $http: 'https://api.test/x' }],
    })
    expect(http.callCount).toBe(2)

    // ...and the second evaluation is served from the one entry they wrote
    await fig.evaluate({ $http: 'https://api.test/x' })
    expect(http.callCount).toBe(2)
  })
})
