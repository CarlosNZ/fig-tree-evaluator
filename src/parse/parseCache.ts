/**
 * The two-layer parse cache ("Cache keying for non-identical inputs" and
 * "Parse-cache sizing and eligibility" in
 * docs-dev/v3-specs/v3-implementation-notes.md; artifact obligations C1
 * and C5; the lifecycle in docs-dev/v3-specs/v3-worked-examples.md).
 *
 * An identity `WeakMap` in front, a bounded content-keyed LRU behind it.
 * Identity is a pointer lookup and costs nothing to keep — no bound, no
 * eviction, entries die with their keys — and it is the only sound layer
 * for an input holding opaque constants. The content layer catches the
 * fresh-instance pattern: a React host re-creating expressions per render,
 * a back-end host loading the same config per request. A content hit
 * re-registers under the new object's identity, so that object pays one
 * serialization and is O(1) from then on.
 *
 * Eligibility, straight from the measurement: primitives take neither
 * layer (a `WeakMap` cannot key one, and letting them into the LRU would
 * evict exactly the expressions it exists for), constant containers take
 * identity only (a legal key, and a hit turns an O(size) walk into a
 * pointer lookup, where content keying would cost about half of simply
 * reparsing), and expressions with holes take both.
 *
 * There is no clearing API, deliberately: invalidation is replacing the
 * whole cache, which is the instance's job when the registry changes. That
 * also makes it structurally impossible for Phase 9's `clearCache()` to
 * reach it, which is the specified behaviour.
 */
import { Lru } from '../lru'
import type { ParseArtifact } from './artifact'
import { contentKey, serializeInput } from './contentKey'
import type { ProbeResult } from './probe'

/**
 * The content layer's bound. Internal — no option until demand.
 *
 * Sized from the September 2026 measurement: a form-shaped artifact is
 * about 4.2 KB, and the largest reported working set is up to 500
 * expressions. Two hundred entries is roughly a megabyte including the
 * retained keys, and it is enough because the identity layer already
 * carries the hot set unbounded and free, leaving this layer only the
 * arrivals. A miss is cheap either way: a full cold reparse of that whole
 * working set is about a third of a millisecond, so eviction is a
 * performance event and never a correctness one.
 */
export const CONTENT_LAYER_SIZE = 200

/**
 * What a lookup can answer with. An `inert` entry is a memoized probe
 * verdict: the input has nothing to evaluate, so `evaluate()` returns it
 * by identity and never needs an artifact at all. It carries the measured
 * depth because that is what `maxDepth` is compared against.
 */
export type CacheEntry =
  | { kind: 'artifact'; artifact: ParseArtifact }
  | { kind: 'inert'; depth: number }

export interface ParseCacheDeps {
  /** Parse plus the static checks, bound to one registry. */
  compile: (expression: unknown) => ParseArtifact
  /** The allocation-free constancy probe, bound to the same registry. */
  probe: (expression: unknown) => ProbeResult
}

export class ParseCache {
  private readonly identity = new WeakMap<object, CacheEntry>()
  private readonly content: Lru<string, CacheEntry>

  constructor(
    private readonly deps: ParseCacheDeps,
    max: number = CONTENT_LAYER_SIZE
  ) {
    this.content = new Lru<string, CacheEntry>(max)
  }

  /**
   * For `evaluate()`: may answer that the input is inert, in which case
   * the caller returns it by identity without anything ever being parsed.
   */
  resolve(expression: unknown): CacheEntry {
    return this.lookup(expression, true)
  }

  /**
   * For `validate()`, and for `evaluate()` under `trace`: always an
   * artifact. An inert input still earns its unrecognized-`$` warnings, so
   * reporting cannot be served by a probe verdict.
   */
  artifact(expression: unknown): ParseArtifact {
    const entry = this.lookup(expression, false)
    // `lookup` only ever returns `inert` when inert answers are allowed
    return (entry as { kind: 'artifact'; artifact: ParseArtifact }).artifact
  }

  private lookup(expression: unknown, allowInert: boolean): CacheEntry {
    const weakKey = weakKeyOf(expression)

    if (weakKey !== undefined) {
      const held = this.identity.get(weakKey)
      // An inert entry does not satisfy a caller that needs an artifact,
      // but the compile that follows upgrades it in place — an artifact is
      // a strict superset, so nothing is lost by replacing it
      if (held !== undefined && (allowInert || held.kind === 'artifact')) return held
    }

    if (allowInert) {
      const probed = this.deps.probe(expression)
      if (probed.constant) {
        const entry: CacheEntry = { kind: 'inert', depth: probed.depth }
        if (weakKey !== undefined) this.identity.set(weakKey, entry)
        return entry
      }
    }

    // Reached only by genuine expressions on the `evaluate()` path, since
    // constant containers have already exited above — so the O(input)
    // serialization never runs on inert data
    const key = weakKey === undefined ? undefined : keyOf(expression)
    if (key !== undefined) {
      const held = this.content.get(key)
      if (held !== undefined) {
        if (weakKey !== undefined) this.identity.set(weakKey, held)
        return held
      }
    }

    const entry: CacheEntry = { kind: 'artifact', artifact: this.deps.compile(expression) }
    if (weakKey !== undefined) this.identity.set(weakKey, entry)
    // Identity-only artifacts must never be served by content: two inputs
    // holding different opaque constants can serialize alike, and splicing
    // the wrong constants in would be silent. The serializer refuses those
    // too, so this is the second of two independent guards
    if (key !== undefined && !entry.artifact.identityOnly && entry.artifact.holes.length > 0)
      this.content.set(key, entry)
    return entry
  }
}

/** Only an object can key a `WeakMap`; a primitive takes neither layer. */
const weakKeyOf = (expression: unknown): object | undefined =>
  typeof expression === 'object' && expression !== null ? expression : undefined

const keyOf = (expression: unknown): string | undefined => {
  const serialized = serializeInput(expression)
  return serialized === undefined ? undefined : contentKey(serialized)
}
