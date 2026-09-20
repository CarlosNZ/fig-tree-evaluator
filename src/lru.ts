/**
 * A bounded least-recently-used map ("Cache keying for non-identical
 * inputs" in docs-dev/v3-specs/v3-implementation-notes.md).
 *
 * Domain-free on purpose: the parse cache's content layer is the first
 * consumer, the result cache's default store (Phase 9.1) the second.
 *
 * `Map` iterates in insertion order, so the least-recently-used entry is
 * simply the first key, and promoting an entry is a delete followed by a
 * set. That makes the whole structure a few lines over a built-in, with no
 * bookkeeping to keep in step.
 */
export class Lru<K, V> {
  private readonly entries = new Map<K, V>()

  constructor(private readonly max: number) {
    // A bound below one would evict what it just stored, so every lookup
    // would miss and the layer would be pure overhead
    if (!Number.isInteger(max) || max < 1)
      throw new RangeError('LRU bound must be a positive integer')
  }

  get size(): number {
    return this.entries.size
  }

  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined
    const value = this.entries.get(key) as V
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    // At most one entry over the bound, since a set adds at most one
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value as K)
  }
}
