/**
 * The caching semantics ("Caching" in
 * docs-dev/v3-specs/v3-operator-contract.md): what is keyed, when, and
 * what a body's own `memo` call means.
 *
 * Deliberately separate from ../resultCache.ts, which owns the store, the
 * expiry and the generation and knows nothing about nodes. The split is
 * the spec's own: a store is storage, and caching is a policy over it.
 *
 * Two layers, selected by the definition's `cache` field and gated by the
 * effective `useCache` chain. `'auto'` memoizes the whole body run on the
 * resolved parameters; `'manual'` leaves the keying to the body, which is
 * how the I/O operators key the effective request rather than the
 * authored spelling.
 */
import { serializeInput, type OperatorNode } from '../parse'
import type { ResultStore } from '../resultCache'
import type { OperatorContext } from '../runtimeInterface'

/**
 * A layer tag opens every key. Not decoration: `memo` is present on every
 * context, so a `cache: 'auto'` operator's body may call it too, and
 * without the tag a body could be handed the entry the engine wrote for
 * its own outer run.
 */
const AUTO = 'A'
const MANUAL = 'M'

/** What a node contributes to its body's caching: who it is, and whether. */
export interface MemoBinding {
  /** The canonical name — never the alias the author happened to spell. */
  operator: string
  /** The four-step chain's verdict for this node. */
  useCache: boolean
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
  run: () => Promise<T>
): Promise<T> => {
  const generation = cache.generation
  const held = await cache.lookup(key)
  // TO-DO (Phase 12): note the hit and the miss here — this is the one
  // place that knows which it was
  if (held.hit) return held.value as T
  const value = await run()
  await cache.write(key, value, generation)
  return value
}

/**
 * The `'auto'` layer's key: the operator's canonical name and the exact
 * record the body would receive. Nothing else — options are deliberately
 * out, so an operator whose result depends on one it reads takes
 * `'manual'` and folds that dependency into its own key.
 *
 * Parameter order is declaration order (`resolveParams` iterates the
 * declarations), so two spellings of one call — positional, named, keys
 * permuted — produce one key with no canonicalization pass.
 *
 * `undefined` means skip the layer entirely: no read, no write, run the
 * body. Never a weaker key.
 */
export const autoKey = (
  node: OperatorNode,
  params: Record<string, unknown>
): string | undefined => {
  // The contract's "keyed on the resolved eager parameters" cannot be
  // taken literally for an operator that mixes modes: `if` would key on
  // its condition alone, so two nodes with one condition and different
  // branches would collide. An operator that delivers anything lazily is
  // not auto-cacheable at all. This one test is also what keeps an engine
  // handle out of the serializer, which matters because a settlement
  // stream is a plain-prototype object whose only own string key is
  // `length`, so the serializer would ACCEPT it and two different
  // three-element streams would key alike. Past this line every value is
  // an eager result — already through the escaped-handle guard — or an
  // authored constant, so no handle can be present
  if (node.entry.definition.deliversLazily) return undefined
  return serializeInput([AUTO, node.entry.definition.name, params])
}

/**
 * The live `context.cache.memo` — the `'manual'` layer. An identity
 * passthrough when the node's effective `useCache` is false, so a body
 * calls it unconditionally and the gating stays the engine's.
 *
 * Keys are namespaced by operator name engine-side, so a body cannot
 * collide with another operator's entries however it spells its own key.
 */
export const bodyMemo = (
  binding: MemoBinding,
  cache: ResultStore
): OperatorContext['cache']['memo'] => {
  return <T>(key: unknown, fn: () => Promise<T>): Promise<T> => {
    if (!binding.useCache) return fn()
    const full = serializeInput([MANUAL, binding.operator, key])
    // A key holding something that cannot be serialized — a Date off the
    // data, a class instance — runs uncached rather than colliding
    return full === undefined ? fn() : through(cache, full, fn)
  }
}
