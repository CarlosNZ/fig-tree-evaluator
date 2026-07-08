import { trim, toCodePoints } from '../src'

describe('trim', () => {
  it('strips leading and trailing whitespace of all kinds', () => {
    expect(trim('  hello  ')).toBe('hello')
    expect(trim('\t\n hi \r\n')).toBe('hi')
    // NBSP, BOM, line + paragraph separators are all in the JS trim set
    expect(trim(' ﻿  x ')).toBe('x')
  })

  it('leaves internal whitespace untouched', () => {
    expect(trim('  a  b  ')).toBe('a  b')
  })
})

describe('toCodePoints', () => {
  it('segments by code point, never tearing a surrogate pair', () => {
    expect(toCodePoints('abc')).toEqual(['a', 'b', 'c'])
    expect(toCodePoints('\u{1F600}')).toEqual(['\u{1F600}'])
    expect(toCodePoints('\u{1F600}')).toHaveLength(1) // JS .length would say 2
    expect(toCodePoints('a\u{1F600}b')).toEqual(['a', '\u{1F600}', 'b'])
    expect(toCodePoints('')).toEqual([])
  })
})
