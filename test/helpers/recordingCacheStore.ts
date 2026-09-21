/**
 * Recording `CacheStore` — the second shared test double ("Using these as test
 * cases" in docs-dev/v3-specs/v3-worked-examples.md, implementation plan 0.2).
 * A plain in-memory store that logs every key it sees, so cache behaviour —
 * hits vs misses, effective-request keying, invalidation — is assertable from
 * the log without reaching into engine internals.
 *
 * One thing the log cannot answer, and tests must not ask it to: `hits`
 * counts keys PRESENT at read time, which is not the same as entries the
 * engine served. An expired or generation-stale envelope is present and
 * counts as a hit here while the engine correctly re-runs the body. Use body
 * call counts for what was served, and this log for which keys were touched.
 *
 * Implements the real `CacheStore` contract (src/types.ts).
 */
import type { CacheStore } from '../../src'

export interface CacheLogEntry {
  op: 'get' | 'set' | 'delete' | 'clear'
  key: string
  /** For `get`: whether the key was present at read time. */
  hit?: boolean
}

export class RecordingCacheStore implements CacheStore {
  /** Every access in order — the observable log. */
  readonly log: CacheLogEntry[] = []

  private store = new Map<string, unknown>()

  get(key: string): unknown {
    const hit = this.store.has(key)
    this.log.push({ op: 'get', key, hit })
    return this.store.get(key)
  }

  set(key: string, value: unknown): void {
    this.log.push({ op: 'set', key })
    this.store.set(key, value)
  }

  delete(key: string): void {
    this.log.push({ op: 'delete', key })
    this.store.delete(key)
  }

  clear(): void {
    this.log.push({ op: 'clear', key: '' })
    this.store.clear()
  }

  /** Keys read, in order. */
  keysGotten(): string[] {
    return this.log.filter((e) => e.op === 'get').map((e) => e.key)
  }

  /** Keys written, in order. */
  keysSet(): string[] {
    return this.log.filter((e) => e.op === 'set').map((e) => e.key)
  }

  /** Count of reads that found an existing entry. */
  get hits(): number {
    return this.log.filter((e) => e.op === 'get' && e.hit).length
  }

  /** Count of reads that missed. */
  get misses(): number {
    return this.log.filter((e) => e.op === 'get' && !e.hit).length
  }

  /** Number of distinct entries currently held. */
  get size(): number {
    return this.store.size
  }

  /** The raw stored values, for tests that need to see past the log. */
  entries(): [string, unknown][] {
    return [...this.store.entries()]
  }

  /** Drop all entries and clear the log. */
  reset(): void {
    this.store.clear()
    this.log.length = 0
  }
}
