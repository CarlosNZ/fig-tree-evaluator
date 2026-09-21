/**
 * Scripted mock `HttpClient` — one of the two shared test doubles the v3
 * worked examples assume ("Using these as test cases" in
 * docs-dev/v3-specs/v3-worked-examples.md, implementation plan 0.2). Fixed
 * responses, failure + latency switches, and a call counter, so laziness /
 * memoization / effective-request keying become assertable as *counts and call
 * logs* rather than by reaching into engine internals.
 *
 * Implements the real `HttpClient` contract (src/types.ts) — the same interface
 * `FetchClient` / `AxiosClient` satisfy, so a test never has to distinguish the
 * mock from a real client, and the shared conformance suite runs over all
 * three (contract Q8's check).
 */
import { OperatorFailure } from '../../src'
import type { HttpClient, HttpRequest } from '../../src'

export interface MockHttpRequest {
  url: string
  method: 'get' | 'post'
  headers: Record<string, string>
  body?: unknown
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
   * Fail like a real non-2xx response instead: sets the `errorData` a real
   * client would build, so an expression's `fallback` / error assertions
   * see the shape they will see in production.
   */
  failStatus?: number
  /** The response body carried by a `failStatus` failure. */
  failResponse?: unknown
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
  failStatus?: number
  failResponse: unknown
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
    this.failStatus = options.failStatus
    this.failResponse = options.failResponse
    this.latencyMs = options.latencyMs ?? 0
  }

  /**
   * How many requests have been made — the fetch-count assertion the examples
   * use.
   */
  get callCount(): number {
    return this.calls.length
  }

  request = async (req: HttpRequest): Promise<unknown> => {
    this.calls.push({ url: req.url, method: req.method, headers: req.headers, body: req.body })

    if (this.latencyMs > 0) await delay(this.latencyMs, req.signal)
    if (req.signal?.aborted) throw abortError()
    if (this.failStatus !== undefined) throw this.statusFailure(req.url)
    if (this.fail)
      throw new OperatorFailure(this.failMessage, {
        ...(this.failData !== undefined
          ? { errorData: this.failData as Record<string, unknown> }
          : {}),
      })

    return this.resolveResponse(req.url)
  }

  /** The payload a real client builds for a non-2xx response. */
  private statusFailure(url: string): OperatorFailure {
    const status = this.failStatus as number
    return new OperatorFailure(`request failed (${status}): ${url}`, {
      errorData: {
        status,
        statusText: this.failMessage,
        url,
        response: this.failResponse ?? null,
      },
    })
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
