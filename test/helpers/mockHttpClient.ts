/**
 * Scripted mock `HttpClient` — one of the two shared test doubles the v3
 * worked examples assume ("Using these as test cases" in
 * docs-dev/v3-specs/v3-worked-examples.md, implementation plan 0.2). Fixed
 * responses, failure + latency switches, and a call counter, so laziness /
 * memoization / effective-request keying become assertable as *counts and call
 * logs* rather than by reaching into engine internals.
 *
 * Implements the real `HttpClient` contract (src/types.ts) — the same interface
 * `FetchClient` / `AxiosClient` will satisfy in Phase 9, so a test never has to
 * distinguish the mock from a real client (contract Q8's conformance point).
 */
import type { HttpClient } from '../../src'

export interface MockHttpRequest {
  url: string
  method: 'get' | 'post'
  headers: Record<string, string>
  body?: unknown
}

/**
 * Stand-in for the structured failure a real client throws on a non-2xx /
 * non-JSON response. Phase 9's clients throw the exported `OperatorFailure`
 * (Phase 1.2); until that class exists this local error carries the same
 * `errorData` payload.
 */
export class MockHttpFailure extends Error {
  readonly errorData: unknown
  constructor(message: string, errorData?: unknown) {
    super(message)
    this.name = 'MockHttpFailure'
    this.errorData = errorData
  }
}

const abortError = () => {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true }
    )
  })

export interface MockHttpClientOptions {
  /**
   * Map from URL to the parsed JSON body to return. By default a key matches
   * when it is a substring of the request URL (so fully-resolved query strings
   * still match a base); set `exactMatch` to require identity.
   */
  responses?: Record<string, unknown>
  /**
   * Returned when no `responses` key matches. Defaults to `null` (a 204-style
   * empty success).
   */
  defaultResponse?: unknown
  /**
   * Require exact URL equality instead of substring matching (default false).
   */
  exactMatch?: boolean
  /** When true, every request rejects — the failure switch. */
  fail?: boolean
  /** Message for the thrown failure. */
  failMessage?: string
  /** `errorData` payload attached to the thrown failure. */
  failData?: unknown
  /**
   * Artificial latency (ms) applied before each response resolves/rejects —
   * the latency switch.
   */
  latencyMs?: number
}

export class MockHttpClient implements HttpClient {
  /** Every request seen, in order — the observable call log. */
  readonly calls: MockHttpRequest[] = []

  fail: boolean
  failMessage: string
  failData: unknown
  latencyMs: number

  private responses: Record<string, unknown>
  private defaultResponse: unknown
  private exactMatch: boolean

  constructor(options: MockHttpClientOptions = {}) {
    this.responses = options.responses ?? {}
    this.defaultResponse = options.defaultResponse ?? null
    this.exactMatch = options.exactMatch ?? false
    this.fail = options.fail ?? false
    this.failMessage = options.failMessage ?? 'Mock HTTP failure'
    this.failData = options.failData
    this.latencyMs = options.latencyMs ?? 0
  }

  /**
   * How many requests have been made — the fetch-count assertion the examples
   * use.
   */
  get callCount(): number {
    return this.calls.length
  }

  async request(req: {
    url: string
    method: 'get' | 'post'
    headers: Record<string, string>
    body?: unknown
    signal: AbortSignal
  }): Promise<unknown> {
    this.calls.push({ url: req.url, method: req.method, headers: req.headers, body: req.body })

    if (this.latencyMs > 0) await delay(this.latencyMs, req.signal)
    if (req.signal?.aborted) throw abortError()
    if (this.fail) throw new MockHttpFailure(this.failMessage, this.failData)

    return this.resolveResponse(req.url)
  }

  private resolveResponse(url: string): unknown {
    for (const [key, value] of Object.entries(this.responses)) {
      if (this.exactMatch ? key === url : url.includes(key)) return value
    }
    return this.defaultResponse
  }

  /** Register or replace a scripted response after construction. */
  setResponse(urlKey: string, value: unknown): void {
    this.responses[urlKey] = value
  }

  /** Clear the call log (switch settings are left untouched). */
  reset(): void {
    this.calls.length = 0
  }
}
