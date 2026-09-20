/**
 * A bounded least-recently-used map ("Cache keying for non-identical
 * inputs" in docs-dev/v3-specs/v3-implementation-notes.md).
 *
 * Domain-free on purpose: the parse cache's content layer is the first
 * consumer, the result cache's eviction ledger (Phase 9.1) the second.
 *
 * `Map` iterates in insertion order, so the least-recently-used entry is
 * simply the first key, and promoting an entry is a delete followed by a
 * set. That makes the whole structure a few lines over a built-in, with no
 * bookkeeping to keep in step — and every operation O(1) amortised.
 *
 * `set` and `resize` report what they evicted, because a consumer may own
 * storage this class knows nothing about: the result cache's ledger holds
 * keys into a host-supplied store, and an eviction there has to become a
 * `delete` on that store.
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

  /** Stores, promoting an existing key; returns the key it evicted, if any. */
  set(key: K, value: V): K | undefined {
    this.entries.delete(key)
    this.entries.set(key, value)
    // At most one entry over the bound, since a set adds at most one
    if (this.entries.size <= this.max) return undefined
    return this.evictOldest()
  }

  clear(): void {
    this.entries.clear()
  }

  /** Changes the bound; returns the keys a shrink evicted, oldest first. */
  resize(max: number): K[] {
    checkBound(max)
    this.max = max
    const evicted: K[] = []
    while (this.entries.size > this.max) evicted.push(this.evictOldest() as K)
    return evicted
  }

  private evictOldest(): K | undefined {
    const oldest = this.entries.keys().next()
    if (oldest.done === true) return undefined
    this.entries.delete(oldest.value)
    return oldest.value
  }
}

// A bound below one would evict what it just stored, so every lookup would
// miss and the layer would be pure overhead
const checkBound = (max: number) => {
  if (!Number.isInteger(max) || max < 1)
    throw new RangeError('LRU bound must be a positive integer')
}
