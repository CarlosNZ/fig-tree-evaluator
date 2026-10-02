/**
 * The caching semantics ("Caching" in
 * docs-dev/v3-specs/v3-operator-contract.md): what is keyed, when, and
 * what a body's own `memo` call means.
 *
 * Deliberately separate from ../resultCache.ts, which owns the store, the
 * expiry and the generation and knows nothing about nodes. The split is
 * the spec's own: a store is storage, and caching is a policy over it.
 *
 * One layer: a caching body keys its own units through `context.cache.memo`,
 * which is how the I/O operators key the effective request rather than the
 * authored spelling. The engine only decides whether a node's `memo` is
 * live (src/evaluate/operator.ts) and namespaces the keys.
 */
import { serializeInput } from '../compile'
import type { ResultStore } from '../resultCache'
import type { OperatorContext, TraceEvent } from '../runtimeInterface'

/** What a caching node contributes to its body's memo: who it is. */
export interface MemoBinding {
  /** The canonical name — never the alias the author happened to spell. */
  operator: string
  /**
   * The definition's fingerprint (src/defineOperator.ts). Two definitions
   * registered under one name — in turn on one instance, or held by a
   * compiled expression across a redefinition — must never share an
   * entry, and the name alone cannot tell them apart.
   */
  fingerprint: string
  /** Where a hit or miss is recorded; absent when trace is off. */
  note?: (event: TraceEvent) => void
}

/**
 * Lookup, run on a miss, write. Failures are never cached because a throw
 * from `run` leaves before the write — there is no catch here to make it
 * otherwise.
 *
 * The generation is captured BEFORE the run, so a `clearCache()` landing
 * while the unit is in flight discards its result rather than storing a
 * value computed from the world the caller just threw away.
 */
export const through = async <T>(
  cache: ResultStore,
  key: string,
  run: () => Promise<T>,
  note?: (event: TraceEvent) => void
): Promise<T> => {
  const generation = cache.generation
  const held = await cache.lookup(key)
  // The one place that knows which it was: a hit means the body never
  // ran, so the node's entry has no children and no body events, and
  // this is the only thing that explains why
  note?.({ type: 'cache', hit: held.hit })
  if (held.hit) return held.value as T
  const value = await run()
  await cache.write(key, value, generation)
  return value
}

/**
 * The live `context.cache.memo`, for a node that is caching. A body calls
 * it unconditionally, and the gating stays the engine's: a node that is
 * not caching is handed the shared identity passthrough by
 * `createOperatorContext` instead, so this is built only where it can
 * store something.
 *
 * Keys are namespaced by operator name and fingerprint engine-side, so a
 * body cannot collide with another operator's entries, or with another
 * definition's under the same name, however it spells its own key.
 */
export const bodyMemo = (
  binding: MemoBinding,
  cache: ResultStore
): OperatorContext['cache']['memo'] => {
  return <T>(key: unknown, fn: () => Promise<T>): Promise<T> => {
    const full = serializeInput([binding.operator, binding.fingerprint, key])
    // A key holding something that cannot be serialized — a Date off the
    // data, a class instance, an engine handle — runs uncached rather than
    // colliding
    return full === undefined ? fn() : through(cache, full, fn, binding.note)
  }
}
