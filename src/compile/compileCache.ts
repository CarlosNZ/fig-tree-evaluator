/**
 * The two-layer compile cache ("Cache keying for non-identical inputs" and
 * "Compile-cache sizing and eligibility" in
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
import type { CompileArtifact } from './artifact'
import { serializeInput } from './contentKey'
import type { ProbeResult } from './probe'

/**
 * The content layer's bound. Internal — no option until demand.
 *
 * Sized from the September 2026 measurement: a form-shaped artifact is
 * about 4.2 KB, and the largest reported working set is up to 500
 * expressions. Two hundred entries is roughly a megabyte including the
 * retained keys, and it is enough because the identity layer already
 * carries the hot set unbounded and free, leaving this layer only the
 * arrivals. A miss is cheap either way: a full cold recompile of that whole
 * working set is about a third of a millisecond, so eviction is a
 * performance event and never a correctness one.
 */
export const CONTENT_LAYER_SIZE = 200

/**
 * What `resolve` answers with. An `inert` entry is a memoized probe
 * verdict: the input has nothing to evaluate, so `evaluate()` returns it
 * by identity and never needs an artifact at all. It carries the measured
 * depth because that is what `maxDepth` is compared against.
 */
export type CacheEntry =
  { kind: 'artifact'; artifact: CompileArtifact } | { kind: 'inert'; depth: number }

export interface CompileCacheDeps {
  /** The walk plus the static checks, bound to one registry. */
  compile: (expression: unknown) => CompileArtifact
  /** The allocation-free constancy probe, bound to the same registry. */
  probe: (expression: unknown) => ProbeResult
}

/**
 * `evaluate()` and `compile()` are the two consumers, and share one cache:
 * membership tracks intent to evaluate, and a handle is the strongest
 * statement of it, so after `compile(expr)` a plain `evaluate(expr)` hits
 * and the reverse. Sound because an artifact is data- and
 * option-independent and every piece of per-holder state lives on the
 * handle (obligation C2). `validate()`, `getDependencies()` and
 * `isEvaluable()` compile fresh and never touch the cache — they are
 * authoring tools, their report should cost a compile, and reading the
 * cache would need a second answer shape here (an inert verdict cannot
 * report the unrecognized-`$` warning a full artifact carries).
 */
export class CompileCache {
  private readonly identity = new WeakMap<object, CacheEntry>()
  private readonly content = new Lru<string, CompileArtifact>(CONTENT_LAYER_SIZE)

  constructor(private readonly deps: CompileCacheDeps) {}

  resolve(expression: unknown): CacheEntry {
    // Only an object can key a `WeakMap`; a primitive takes neither layer
    const weakKey = typeof expression === 'object' && expression !== null ? expression : undefined

    if (weakKey !== undefined) {
      const held = this.identity.get(weakKey)
      if (held !== undefined) return held
    }

    const probed = this.deps.probe(expression)
    if (probed.constant) {
      const entry: CacheEntry = { kind: 'inert', depth: probed.depth }
      if (weakKey !== undefined) this.identity.set(weakKey, entry)
      return entry
    }

    // Reached only by genuine expressions, since constant containers have
    // exited above — so the O(input) serialization never runs on inert data
    const key = weakKey === undefined ? undefined : serializeInput(expression)
    const held = key === undefined ? undefined : this.content.get(key)
    const artifact = held ?? this.deps.compile(expression)
    const entry: CacheEntry = { kind: 'artifact', artifact }
    if (weakKey !== undefined) this.identity.set(weakKey, entry)
    // Identity-only artifacts must never be served by content: two inputs
    // holding different opaque constants can serialize alike, and splicing
    // the wrong constants in would be silent. The serializer refuses those
    // too, so this is the second of two independent guards
    if (
      key !== undefined &&
      held === undefined &&
      !artifact.identityOnly &&
      artifact.holes.length > 0
    )
      this.content.set(key, artifact)
    return entry
  }
}
