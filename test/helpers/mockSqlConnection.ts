/**
 * Scripted mock `SqlConnection` — the SQL half of the observability
 * harness, and the sibling of `MockHttpClient` in every respect that
 * matters: scripted answers, a call log, failure and latency switches, and
 * a count, so `sql`'s memoization and cancellation become assertable as
 * counts rather than by reaching into the engine.
 *
 * Phase 0.2 built only the HTTP mock and the recording store; this arrives
 * with the operators that need it (Phase 9.2).
 *
 * Implements the real `SqlConnection` contract (src/types.ts), so the same
 * conformance suite runs over it and over the bundled wrappers.
 */
import { OperatorFailure } from '../../src'
import type { SqlConnection, SqlRequest } from '../../src'

export interface MockSqlQuery {
  text: string
  values?: unknown[] | Record<string, unknown>
}

export interface MockSqlConnectionOptions {
  /**
   * Map from a fragment of the SQL text to the rows it answers with. The
   * first key that appears in the query wins; set `exactMatch` to require
   * the whole text.
   */
  rows?: Record<string, Record<string, unknown>[]>
  /** Returned when no key matches. Defaults to an empty result. */
  defaultRows?: Record<string, unknown>[]
  exactMatch?: boolean
  /** When true, every query rejects — the failure switch. */
  fail?: boolean
  failMessage?: string
  /** Artificial latency (ms) before the rows come back — the latency switch. */
  latencyMs?: number
}

const abortError = () => {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

export class MockSqlConnection implements SqlConnection {
  /** Every query seen, in order — the observable call log. */
  readonly calls: MockSqlQuery[] = []

  fail: boolean
  failMessage: string
  latencyMs: number

  private rows: Record<string, Record<string, unknown>[]>
  private defaultRows: Record<string, unknown>[]
  private exactMatch: boolean

  constructor(options: MockSqlConnectionOptions = {}) {
    this.rows = options.rows ?? {}
    this.defaultRows = options.defaultRows ?? []
    this.exactMatch = options.exactMatch ?? false
    this.fail = options.fail ?? false
    this.failMessage = options.failMessage ?? 'Mock SQL failure'
    this.latencyMs = options.latencyMs ?? 0
  }

  /** How many queries have run — the count the cache tests assert on. */
  get queryCount(): number {
    return this.calls.length
  }

  query = async (req: SqlRequest): Promise<Record<string, unknown>[]> => {
    this.calls.push({
      text: req.text,
      ...(req.values !== undefined ? { values: req.values } : {}),
    })

    if (this.latencyMs > 0) await this.wait(req.signal)
    // A real driver often cannot abort, but a mock that ignored the signal
    // entirely could never demonstrate the case where one can
    if (req.signal?.aborted) throw abortError()
    if (this.fail) throw new OperatorFailure(this.failMessage, { errorData: { driver: 'mock' } })

    return this.resolveRows(req.text)
  }

  private wait(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError())
      const timer = setTimeout(resolve, this.latencyMs)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(abortError())
        },
        { once: true }
      )
    })
  }

  private resolveRows(text: string): Record<string, unknown>[] {
    for (const [key, rows] of Object.entries(this.rows)) {
      if (this.exactMatch ? key === text : text.includes(key)) return rows
    }
    return this.defaultRows
  }

  /** Register or replace a scripted answer after construction. */
  setRows(fragment: string, rows: Record<string, unknown>[]): void {
    this.rows[fragment] = rows
  }

  /** Clear the call log (switch settings are left untouched). */
  reset(): void {
    this.calls.length = 0
  }
}
