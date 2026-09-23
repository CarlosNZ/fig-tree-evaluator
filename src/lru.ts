/**
 * A bounded least-recently-used map ("Cache keying for non-identical
 * inputs" in docs-dev/v3-specs/v3-implementation-notes.md).
 *
 * Domain-free on purpose: the compile cache's content layer is one
 * consumer, and the result cache's built-in store is the other — which is
 * why the shape is a superset of `CacheStore` (get/set/delete/clear), so
 * an instance can be handed straight to the result cache as its store.
 *
 * `Map` iterates in insertion order, so the least-recently-used entry is
 * simply the first key, and promoting an entry is a delete followed by a
 * set. That makes the whole structure a few lines over a built-in, with no
 * bookkeeping to keep in step — and every operation O(1) amortised.
 */
export class Lru<K, V> {
  private readonly entries = new Map<K, V>()

  constructor(private max: number) {
    checkBound(max)
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

  /** Stores, promoting an existing key; evicts the oldest past the bound. */
  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    // At most one entry over the bound, since a set adds at most one
    if (this.entries.size > this.max) this.evictOldest()
  }

  delete(key: K): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  /** Changes the bound, evicting least-recently-used entries past a shrink. */
  resize(max: number): void {
    checkBound(max)
    this.max = max
    while (this.entries.size > this.max) this.evictOldest()
  }

  private evictOldest(): void {
    const oldest = this.entries.keys().next()
    if (oldest.done !== true) this.entries.delete(oldest.value)
  }
}

// A bound below one would evict what it just stored, so every lookup would
// miss and the layer would be pure overhead
const checkBound = (max: number) => {
  if (!Number.isInteger(max) || max < 1)
    throw new RangeError('LRU bound must be a positive integer')
}
