/**
 * Chunk 9.2 — registering the I/O operators ("Operator registration" in
 * the Options area of docs-dev/v3-specs/v3-api.md; the `httpOperators()`
 * ruling in docs-dev/v3-specs/v3-packaging.md).
 *
 * The point of the factories is that capability is gated by registration
 * rather than by import path: importing `httpOperators` gives an instance
 * nothing, and an instance can only reach the network because a host
 * visibly put the factory's output in the `operators` array.
 */
import { FigTree, FigTreeError, coreOperators, httpOperators, sqlOperators } from '../src'
import { MockHttpClient, MockSqlConnection } from './helpers'
import { rejection } from './helpers/rejection'

/** Runs a body with no global fetch, restoring it afterwards. */
const withoutGlobalFetch = (body: () => void) => {
  const original = globalThis.fetch
  // @ts-expect-error — emulating a runtime that has none
  delete globalThis.fetch
  try {
    body()
  } finally {
    globalThis.fetch = original
  }
}

describe('httpOperators()', () => {
  it('registers http and graphQL together, from one client', () => {
    const fig = new FigTree({
      operators: [coreOperators, httpOperators(new MockHttpClient())],
    })
    expect(fig.validate({ $http: 'https://api.test/x' }).valid).toBe(true)
    expect(fig.validate({ $graphQL: 'query { a }' }).valid).toBe(true)
  })

  it('defaults to a fetch-backed client when given no argument', () => {
    expect(() => new FigTree({ operators: [coreOperators, httpOperators()] })).not.toThrow()
  })

  it('throws at REGISTRATION where there is no global fetch, naming the remedy', () => {
    withoutGlobalFetch(() => {
      expect(() => httpOperators()).toThrow(/no global fetch/)
    })
  })

  it('never probes the global when handed a client', () => {
    // The default parameter is evaluated only when the argument is
    // omitted, which is the whole "only fetch gets this" clause
    withoutGlobalFetch(() => {
      expect(() => httpOperators(new MockHttpClient())).not.toThrow()
    })
  })

  it('refuses the driver where a client was meant — the likely mistake', () => {
    const axiosLike = Object.assign(() => undefined, { isAxiosError: () => false })
    // @ts-expect-error — the parameter is an HttpClient instance, never the
    // import
    expect(() => httpOperators(axiosLike)).toThrow(FigTreeError)
    // @ts-expect-error — nor a config object
    expect(() => httpOperators({ baseURL: 'https://api.test' })).toThrow(/HttpClient/)
  })
})

describe('sqlOperators()', () => {
  it('registers sql from a connection', () => {
    const fig = new FigTree({
      operators: [coreOperators, sqlOperators(new MockSqlConnection())],
    })
    expect(fig.validate({ $sql: ['SELECT 1'] }).valid).toBe(true)
  })

  it('has no default — there is no ambient database to adopt', () => {
    // @ts-expect-error — the argument is required, deliberately
    expect(() => sqlOperators()).toThrow(/SqlConnection/)
  })
})

describe('a clientless instance', () => {
  const bare = new FigTree()

  it('refuses the canonical face outright', async () => {
    // v2 threw 'No HTTP client provided' when the node RAN, in front of
    // the end user. Absence is structural now, so it lands on the author
    const report = bare.validate({ operator: 'http', url: 'https://api.test/x' })
    expect(report.valid).toBe(false)
    expect(report.issues[0].code).toBe('unknown-operator')

    const error = await rejection<FigTreeError>(
      bare.evaluate({ operator: 'sql', query: 'SELECT 1' })
    )
    expect(error.code).toBe('unknown-operator')
  })

  it('warns on the shorthand face, which stays data', async () => {
    // The `$name` face cannot be an error without making every `$`-keyed
    // data object one, so the grammar warns and the object passes through
    // untouched. Loud enough for an editor, silent enough for real data
    const report = bare.validate({ $http: 'https://api.test/x' })
    expect(report.valid).toBe(true)
    expect(report.issues[0].code).toBe('unrecognized-identifier')
    expect(await bare.evaluate({ $http: 'https://api.test/x' })).toEqual({
      $http: 'https://api.test/x',
    })
  })

  it('is what omitting `operators` means — core only, no I/O', () => {
    expect(bare.validate({ $plus: [1, 2] }).valid).toBe(true)
  })
})

describe('the registry is stated exhaustively', () => {
  it('drops the core set when a host names only the I/O operators', () => {
    const fig = new FigTree({ operators: [httpOperators(new MockHttpClient())] })
    const report = fig.validate({ operator: 'plus', values: [1, 2] })
    expect(report.valid).toBe(false)
    expect(report.issues[0].code).toBe('unknown-operator')
  })

  it('collides when the same factory is registered twice', () => {
    const client = new MockHttpClient()
    expect(
      () => new FigTree({ operators: [httpOperators(client), httpOperators(client)] })
    ).toThrow(FigTreeError)
  })
})
