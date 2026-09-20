/**
 * The result cache ("Caching" in docs-dev/v3-specs/v3-operator-contract.md;
 * the `cache` option in the Options area of docs-dev/v3-specs/v3-api.md).
 *
 * Storage plus policy, and nothing about nodes or operators: what to key
 * and when to cache is the engine's half, next door in
 * ./evaluate/memo.ts. This half owns the store, the bound, the expiry and
 * the generation.
 *
 * Deliberately disjoint from the parse cache
 * ("Two caches, deliberately disjoint" in
 * docs-dev/v3-specs/v3-implementation-notes.md): that one keys the
 * authored input before any data exists and is invalidated by replacing
 * it; this one keys resolved runtime values and is emptied by
 * `clearCache()`. The lifetimes differ to match, which is why this lives
 * beside the instance state rather than inside it.
 *
 * A cache is never load-bearing for correctness, so every fault here
 * degrades to not-caching rather than failing an evaluation. This is the
 * one place in the engine that swallows.
 */
import { ErrorCodes } from './errorCodes'
import { FigTreeError } from './FigTreeError'
import { Lru } from './lru'
import type { CacheStore } from './types'
import { isPlainDataObject } from './utils'

/** v2's defaults, kept: fifty entries, thirty minutes. */
export const DEFAULT_MAX_SIZE = 50
export const DEFAULT_MAX_TIME = 1800

/** The `cache` option block, validated and filled. */
export interface ResolvedCacheConfig {
  store?: CacheStore
  maxSize: number
  /** Seconds. `Infinity` means entries never expire. */
  maxTime: number
}

/** What an evaluation is handed: the store, seen as reads and writes. */
export interface ResultStore {
  lookup(key: string): Promise<CacheHit | CacheMiss>
  write(key: string, value: unknown, generation: number, ttlSeconds?: number): Promise<void>
  /** Captured before a unit runs, quoted back when its result is written. */
  readonly generation: number
}

export interface CacheHit {
  hit: true
  value: unknown
}
export interface CacheMiss {
  hit: false
}

const MISS: CacheMiss = { hit: false }

/**
 * The engine-owned wrapper actually written to a store. Fields are spelled
 * out rather than abbreviated because a persisting store round-trips them
 * and someone will read them: `generation` is a monotonic counter, not a
 * time, and `expiresAt` is an absolute epoch-millisecond instant.
 *
 * `fig` is a shape marker, not a brand — a symbol could not survive a
 * store that serializes. Anything that is not a well-formed envelope reads
 * as a miss, which is what makes a shared, persisted or host-pre-populated
 * store safe to point at.
 */
interface Envelope {
  fig: typeof ENVELOPE_MARK
  value: unknown
  generation: number
  expiresAt?: number
}

const ENVELOPE_MARK = 'ft3'

const isEnvelope = (value: unknown): value is Envelope =>
  isPlainDataObject(value) &&
  (value as Record<string, unknown>).fig === ENVELOPE_MARK &&
  typeof (value as Record<string, unknown>).generation === 'number'

/**
 * Validate the `cache` option block, filling the defaults. Total and
 * pure, so it can run before anything mutates: a rejected `updateOptions`
 * must leave the instance exactly as it was.
 */
export const readCacheConfig = (block: unknown): ResolvedCacheConfig => {
  if (block === undefined) return { maxSize: DEFAULT_MAX_SIZE, maxTime: DEFAULT_MAX_TIME }
  if (!isPlainDataObject(block)) throw configError("'cache' must be an object")

  const { store, maxSize, maxTime } = block as Record<string, unknown>
  if (store !== undefined && !isCacheStore(store))
    throw configError("'cache.store' must provide get, set, delete and clear methods")
  if (maxSize !== undefined && (!Number.isInteger(maxSize) || (maxSize as number) < 1))
    throw configError("'cache.maxSize' must be a positive integer")
  // Zero would mean "cache nothing", which `useCache: false` already says;
  // admitting it here would give one behaviour two spellings
  if (maxTime !== undefined && (typeof maxTime !== 'number' || maxTime <= 0 || Number.isNaN(maxTime)))
    throw configError("'cache.maxTime' must be a positive number of seconds, or Infinity")

  return {
    ...(store !== undefined ? { store: store as CacheStore } : {}),
    maxSize: (maxSize as number | undefined) ?? DEFAULT_MAX_SIZE,
    maxTime: (maxTime as number | undefined) ?? DEFAULT_MAX_TIME,
  }
}

const isCacheStore = (value: unknown): value is CacheStore =>
  typeof value === 'object' &&
  value !== null &&
  (['get', 'set', 'delete', 'clear'] as const).every(
    (method) => typeof (value as Record<string, unknown>)[method] === 'function'
  )

const configError = (message: string) =>
  new FigTreeError({ code: ErrorCodes.invalidOptions, message, path: [] })

export class ResultCache implements ResultStore {
  private store: CacheStore
  private maxTime: number
  /**
   * The keys this instance has written, in recency order — its own
   * bookkeeping, because a `CacheStore` has no ordering of its own.
   * Holding it here rather than making the default store an `Lru` is what
   * lets `maxSize` mean the same thing for a host-supplied store: the
   * bound is on what THIS instance put there, which is the only claim that
   * stays honest when the store is shared or persisted.
   */
  private keys: Lru<string, true>
  private current = 0

  constructor(config: ResolvedCacheConfig) {
    this.store = config.store ?? new Map<string, unknown>()
    this.maxTime = config.maxTime
    this.keys = new Lru<string, true>(config.maxSize)
  }

  get generation(): number {
    return this.current
  }

  async lookup(key: string): Promise<CacheHit | CacheMiss> {
    let held: unknown
    try {
      held = await this.store.get(key)
    } catch {
      return MISS
    }
    if (!isEnvelope(held)) return MISS
    // Written before the last clearCache(), or past its expiry: either way
    // unreachable, and worth removing while we are here
    if (held.generation < this.current || expired(held)) {
      this.drop(key)
      return MISS
    }
    // A read promotes, or this would be FIFO-with-refresh rather than LRU
    this.keys.get(key)
    return { hit: true, value: held.value }
  }

  async write(
    key: string,
    value: unknown,
    generation: number,
    ttlSeconds?: number
  ): Promise<void> {
    // A clearCache() landed while this unit was running, so its result
    // describes a world the caller has already discarded
    if (generation !== this.current) return
    const seconds = ttlSeconds ?? this.maxTime
    const envelope: Envelope = {
      fig: ENVELOPE_MARK,
      value,
      generation,
      ...(Number.isFinite(seconds) ? { expiresAt: Date.now() + seconds * 1000 } : {}),
    }
    try {
      await this.store.set(key, envelope)
    } catch {
      return
    }
    const evicted = this.keys.set(key, true)
    if (evicted !== undefined) this.drop(evicted)
  }

  /**
   * Sync, all-or-nothing, and total across every store ("clearCache()" in
   * docs-dev/v3-specs/v3-evaluator-methods.md). The generation bump is
   * what makes it total: `store.clear()` may be asynchronous, and a
   * request may already be in flight, so entries can outlive the call
   * either way — bumping the counter makes every one of them read as a
   * miss the moment the method returns.
   */
  clear(): void {
    this.current += 1
    this.keys.clear()
    try {
      void Promise.resolve(this.store.clear()).catch(noop)
    } catch {
      // A store that throws synchronously has still been invalidated
    }
  }

  /**
   * Re-read the `cache` block after `updateOptions`. The store is replaced
   * only when a different one is supplied, so entries survive a change
   * that could not have affected them — the merge rule's `cache: { maxSize }`
   * row promises exactly that.
   */
  configure(config: ResolvedCacheConfig): void {
    const store = config.store ?? this.store
    if (store !== this.store) {
      this.store = store
      this.keys.clear()
    }
    this.maxTime = config.maxTime
    for (const evicted of this.keys.resize(config.maxSize)) this.drop(evicted)
  }

  /** Best-effort removal: a store that cannot forget is still correct. */
  private drop(key: string): void {
    this.keys.get(key) // no-op unless present; keeps the ledger truthful
    try {
      void Promise.resolve(this.store.delete(key)).catch(noop)
    } catch {
      // Nothing to do — the generation and expiry checks already hold
    }
  }
}

const expired = (envelope: Envelope): boolean =>
  envelope.expiresAt !== undefined && envelope.expiresAt <= Date.now()

const noop = () => {}
