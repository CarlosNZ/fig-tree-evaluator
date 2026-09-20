/**
 * The bounded LRU behind the parse cache's content layer ("Cache keying
 * for non-identical inputs" in
 * docs-dev/v3-specs/v3-implementation-notes.md).
 */
import { Lru } from '../src/lru'

const fill = (lru: Lru<string, number>, keys: string[]) =>
  keys.forEach((key, index) => lru.set(key, index))

test('evicts the least recently used entry once the bound is passed', () => {
  const lru = new Lru<string, number>(3)
  fill(lru, ['a', 'b', 'c'])
  expect(lru.size).toBe(3)
  lru.set('d', 3)
  expect(lru.size).toBe(3)
  expect(lru.get('a')).toBeUndefined()
  expect(lru.get('b')).toBe(1)
})

test('a read promotes, so the next eviction takes someone else', () => {
  const lru = new Lru<string, number>(3)
  fill(lru, ['a', 'b', 'c'])
  lru.get('a')
  lru.set('d', 3)
  expect(lru.get('a')).toBe(0)
  expect(lru.get('b')).toBeUndefined()
})

test('re-setting an existing key promotes without growing', () => {
  const lru = new Lru<string, number>(2)
  fill(lru, ['a', 'b'])
  lru.set('a', 99)
  expect(lru.size).toBe(2)
  lru.set('c', 3)
  expect(lru.get('a')).toBe(99)
  expect(lru.get('b')).toBeUndefined()
})

test('holds exactly the bound, and nothing is evicted below it', () => {
  const lru = new Lru<string, number>(5)
  fill(lru, ['a', 'b', 'c', 'd', 'e'])
  expect(lru.size).toBe(5)
  expect(['a', 'b', 'c', 'd', 'e'].map((key) => lru.get(key))).toEqual([0, 1, 2, 3, 4])
})

test('a bound of one keeps only the newest', () => {
  const lru = new Lru<string, number>(1)
  fill(lru, ['a', 'b'])
  expect(lru.get('a')).toBeUndefined()
  expect(lru.get('b')).toBe(1)
})

test('refuses a bound that would evict what it just stored', () => {
  expect(() => new Lru<string, number>(0)).toThrow(RangeError)
  expect(() => new Lru<string, number>(1.5)).toThrow(RangeError)
})

/**
 * Chunk 9.1 additions. The result cache's eviction ledger is the second
 * consumer, and it needs to ACT on an eviction — deleting the evicted key
 * from a store the LRU itself knows nothing about — so `set` reports who
 * it dropped. `clear` and `resize` serve `clearCache()` and a `maxSize`
 * update.
 */
describe('reporting the evicted key', () => {
  test('set returns the key it dropped, and undefined when it dropped none', () => {
    const lru = new Lru<string, number>(2)
    expect(lru.set('a', 0)).toBeUndefined()
    expect(lru.set('b', 1)).toBeUndefined()
    expect(lru.set('c', 2)).toBe('a')
  })

  test('re-setting an existing key evicts nobody', () => {
    const lru = new Lru<string, number>(2)
    fill(lru, ['a', 'b'])
    expect(lru.set('a', 99)).toBeUndefined()
    expect(lru.size).toBe(2)
  })

  test('the reported key is the least recently USED, not the oldest inserted', () => {
    const lru = new Lru<string, number>(2)
    fill(lru, ['a', 'b'])
    lru.get('a')
    expect(lru.set('c', 2)).toBe('b')
  })
})

describe('clear', () => {
  test('drops every entry and leaves the bound intact', () => {
    const lru = new Lru<string, number>(2)
    fill(lru, ['a', 'b'])
    lru.clear()
    expect(lru.size).toBe(0)
    expect(lru.get('a')).toBeUndefined()
    fill(lru, ['c', 'd'])
    expect(lru.size).toBe(2)
  })
})

describe('resize', () => {
  test('growing keeps everything', () => {
    const lru = new Lru<string, number>(2)
    fill(lru, ['a', 'b'])
    lru.resize(4)
    fill(lru, ['c', 'd'])
    expect(lru.size).toBe(4)
    expect(lru.get('a')).toBe(0)
  })

  test('shrinking evicts the least recently used first, and reports them', () => {
    const lru = new Lru<string, number>(5)
    fill(lru, ['a', 'b', 'c', 'd', 'e'])
    lru.get('a')
    expect(lru.resize(2)).toEqual(['b', 'c', 'd'])
    expect(lru.size).toBe(2)
    expect(lru.get('a')).toBe(0)
    expect(lru.get('e')).toBe(4)
  })

  test('refuses a bound the constructor would refuse', () => {
    const lru = new Lru<string, number>(2)
    expect(() => lru.resize(0)).toThrow(RangeError)
    expect(() => lru.resize(2.5)).toThrow(RangeError)
  })
})
