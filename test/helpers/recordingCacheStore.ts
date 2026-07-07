/**
 * Recording `CacheStore` — the second shared test double (docs/v3-worked-examples.md
 * § "Using these as test cases", implementation plan 0.2). A plain in-memory
 * `{ get, set }` that logs every key it sees, so cache behaviour — hits vs
 * misses, effective-request keying, invalidation — is assertable from the log
 * without reaching into engine internals.
 *
 * Implements the real `CacheStore` contract (src/types.ts).
 */
import type { CacheStore } from '../../src'

export interface CacheLogEntry {
  op: 'get' | 'set'
  key: string
  /** For `get`: whether the key was present at read time. */
  hit?: boolean
}

export class RecordingCacheStore implements CacheStore {
  /** Every get/set in order — the observable access log. */
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

  /** Drop all entries and clear the log. */
  reset(): void {
    this.store.clear()
    this.log.length = 0
  }
}
