import { compareValues } from '../src'

describe('compareValues — numbers', () => {
  it('orders numerically', () => {
    expect(compareValues(1, 2)).toBe(-1)
    expect(compareValues(2, 1)).toBe(1)
    expect(compareValues(2, 2)).toBe(0)
    expect(compareValues(-5, 3)).toBe(-1)
  })
})

describe('compareValues — strings', () => {
  it('orders by code point, not numerically', () => {
    expect(compareValues('Z', 'a')).toBe(-1) // uppercase sorts before lowercase
    expect(compareValues('10', '9')).toBe(-1) // string order, not numeric
    expect(compareValues('a', 'b')).toBe(-1)
    expect(compareValues('abc', 'abc')).toBe(0)
    expect(compareValues('abc', 'ab')).toBe(1) // longer string with shared prefix sorts after
  })

  it('ISO-8601 timestamps order correctly by code point', () => {
    expect(compareValues('2020-01-01', '2020-12-31')).toBe(-1)
  })

  it('uses true code-point order, not UTF-16 code-unit order, for astral chars', () => {
    // '😀' is U+1F600 (> U+FFFF). Code-point order puts it AFTER '￿';
    // JS's default UTF-16 comparison (leading surrogate U+D83D) would put it
    // before.
    expect(compareValues('\u{1F600}', '￿')).toBe(1)
    expect(compareValues('￿', '\u{1F600}')).toBe(-1)
  })
})
