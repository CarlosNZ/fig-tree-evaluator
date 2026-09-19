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
