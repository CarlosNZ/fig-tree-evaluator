/**
 * The result cache ("Caching" in docs-dev/v3-specs/v3-operator-contract.md;
 * the `cache` option in the Options area of docs-dev/v3-specs/v3-api.md).
 *
 * Storage plus policy, and nothing about nodes or operators: what to key
 * and when to cache is the engine's half, next door in
 * ./evaluate/memo.ts. This half owns the store, the expiry and the
 * generation.
 *
 * Deliberately disjoint from the parse cache
 * ("Two caches, deliberately disjoint" in
 * docs-dev/v3-specs/v3-implementation-notes.md): that one keys the
 * authored input before any data exists and is invalidated by replacing
 * it; this one keys resolved runtime values and is emptied by
 * `clearCache()`. The lifetimes differ to match, which is why this lives
 * beside the instance state rather than inside it.
 *
 * The bound belongs to the store. The built-in store is an `Lru` sized by
 * `maxSize`; a host-supplied store brings its own eviction policy and
 * `maxSize` does not reach it. What the engine does own for every store is
 * the expiry and the generation, both stamped into the envelope, so a
 * stale entry reads as a miss wherever it is held.
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

/**
 * What an evaluation is handed: the cache seen as reads and writes only.
 * `clear()` and `configure()` are the instance's verbs, and typing the
 * evaluation context this way keeps them out of the evaluator's reach.
 */
export type ResultStore = Pick<ResultCache, 'lookup' | 'write' | 'generation'>

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
  if (
    maxTime !== undefined &&
    (typeof maxTime !== 'number' || maxTime <= 0 || Number.isNaN(maxTime))
  )
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

export class ResultCache {
  private store: CacheStore
  /**
   * The built-in store, when no host store was supplied. `maxSize` is its
   * bound and nobody else's: a host store has its own memory policy, and
   * an engine that deleted entries from a Redis or lru-cache store past
   * fifty would be overriding a bound the host had already chosen.
   */
  private own?: Lru<string, unknown>
  private maxTime: number
  private current = 0

  constructor(config: ResolvedCacheConfig) {
    if (config.store === undefined) {
      this.own = new Lru<string, unknown>(config.maxSize)
      this.store = this.own
    } else {
      this.store = config.store
    }
    this.maxTime = config.maxTime
  }

  /** Captured before a unit runs, quoted back when its result is written. */
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
    return { hit: true, value: held.value }
  }

  async write(key: string, value: unknown, generation: number): Promise<void> {
    // A clearCache() landed while this unit was running, so its result
    // describes a world the caller has already discarded
    if (generation !== this.current) return
    const envelope: Envelope = {
      fig: ENVELOPE_MARK,
      value,
      generation,
      ...(Number.isFinite(this.maxTime) ? { expiresAt: Date.now() + this.maxTime * 1000 } : {}),
    }
    try {
      await this.store.set(key, envelope)
    } catch {
      // Not caching is always an acceptable outcome
    }
  }

  /**
   * Sync and all-or-nothing ("clearCache()" in
   * docs-dev/v3-specs/v3-evaluator-methods.md). The generation bump is
   * what makes it total for this instance: `store.clear()` may be
   * asynchronous, and a request may already be in flight, so entries can
   * outlive the call either way — bumping the counter makes every envelope
   * written under this instance's generation, or a lower one, read as a
   * miss the moment the method returns. The counter is per instance, so in
   * a store shared between instances an envelope another instance wrote
   * under a higher generation stays reachable until `store.clear()` lands.
   */
  clear(): void {
    this.current += 1
    try {
      void Promise.resolve(this.store.clear()).catch(noop)
    } catch {
      // A store that throws synchronously has still been invalidated
    }
  }

  /**
   * Re-read the `cache` block after `updateOptions`. A host store replaces
   * the current one only when it is a different object, so entries survive
   * a change that could not have affected them — the merge rule's
   * `cache: { maxSize }` row promises exactly that. The built-in store is
   * resized in place for the same reason.
   */
  configure(config: ResolvedCacheConfig): void {
    if (config.store !== undefined && config.store !== this.store) {
      this.store = config.store
      this.own = undefined
    }
    this.maxTime = config.maxTime
    this.own?.resize(config.maxSize)
  }

  /**
   * Best-effort removal of an entry that can never be served again: a
   * store that cannot forget is still correct, because the generation and
   * expiry checks already hold.
   */
  private drop(key: string): void {
    try {
      void Promise.resolve(this.store.delete(key)).catch(noop)
    } catch {
      // Nothing to do
    }
  }
}

const expired = (envelope: Envelope): boolean =>
  envelope.expiresAt !== undefined && envelope.expiresAt <= Date.now()

const noop = () => {}
