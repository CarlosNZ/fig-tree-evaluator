/**
 * The vendored deep-equality primitive (src/primitives/deepEqual.ts) —
 * `equal`'s semantics, pinned: the cases dequal's own suite covers plus the
 * cells the `equal` pass names (Date by time, RegExp by source+flags,
 * key-order insensitivity, cross-type false, NaN).
 */
import { deepEqual } from '../src'

test.each([
  ['identical primitives', 1, 1, true],
  ['different numbers', 1, 2, false],
  ['strings', 'a', 'a', true],
  ['cross-type: number vs numeric string', 1, '1', false],
  ['cross-type: null vs undefined', null, undefined, false],
  ['null vs null', null, null, true],
  ['NaN equals NaN', NaN, NaN, true],
  ['booleans', true, false, false],
  ['+0 and -0 are equal', 0, -0, true],
  ['arrays', [1, [2, 3]], [1, [2, 3]], true],
  ['arrays, different length', [1, 2], [1, 2, 3], false],
  ['arrays, different element', [1, 2, 3], [1, 2, 4], false],
  ['array vs object', [], {}, false],
  ['objects, key order irrelevant', { a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }, true],
  ['objects, extra key', { a: 1 }, { a: 1, b: 2 }, false],
  ['objects, missing key', { a: 1, b: 2 }, { a: 1 }, false],
  ['objects, undefined-valued key vs absent', { a: undefined }, {}, false],
  ['Date by time value', new Date(1000), new Date(1000), true],
  ['Date, different', new Date(1000), new Date(2000), false],
  ['RegExp by source and flags', /ab+/gi, /ab+/gi, true],
  ['RegExp, different flags', /ab+/g, /ab+/i, false],
  ['Map by content', new Map([['a', [1]]]), new Map([['a', [1]]]), true],
  ['Map, different value', new Map([['a', 1]]), new Map([['a', 2]]), false],
  ['Set by content', new Set([1, { x: 1 }]), new Set([{ x: 1 }, 1]), true],
  ['Set, different size', new Set([1]), new Set([1, 2]), false],
  ['typed arrays byte-wise', new Uint8Array([1, 2]), new Uint8Array([1, 2]), true],
  ['typed arrays, different', new Uint8Array([1, 2]), new Uint8Array([1, 3]), false],
])('%s', (_label, a, b, expected) => {
  expect(deepEqual(a, b)).toBe(expected)
  expect(deepEqual(b, a)).toBe(expected)
})

test('class instances compare by own enumerable properties', () => {
  class Point {
    constructor(
      public x: number,
      public y: number
    ) {}
  }
  expect(deepEqual(new Point(1, 2), new Point(1, 2))).toBe(true)
  expect(deepEqual(new Point(1, 2), new Point(1, 3))).toBe(false)
  // different constructors never compare equal
  expect(deepEqual(new Point(1, 2), { x: 1, y: 2 })).toBe(false)
})

test('the same reference is trivially equal, functions included', () => {
  const fn = () => 1
  expect(deepEqual(fn, fn)).toBe(true)
  expect(deepEqual(fn, () => 1)).toBe(false)
})
