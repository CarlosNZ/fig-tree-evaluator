import { checkType, checkConstraints, describeType, isLiteralType, type Constraints } from '../src'

describe('checkType — basic tokens', () => {
  it('matches string / number / boolean / array / object / null', () => {
    expect(checkType('x', 'string').ok).toBe(true)
    expect(checkType(1, 'number').ok).toBe(true)
    expect(checkType(true, 'boolean').ok).toBe(true)
    expect(checkType([1], 'array').ok).toBe(true)
    expect(checkType({ a: 1 }, 'object').ok).toBe(true)
    expect(checkType(null, 'null').ok).toBe(true)

    expect(checkType(1, 'string').ok).toBe(false)
    expect(checkType('1', 'number').ok).toBe(false)
    expect(checkType([], 'object').ok).toBe(false) // array is not a plain object
    expect(checkType(null, 'object').ok).toBe(false)
  })

  it('integer refines number', () => {
    expect(checkType(3, 'integer').ok).toBe(true)
    expect(checkType(-2, 'integer').ok).toBe(true)
    expect(checkType(1.5, 'integer').ok).toBe(false)
    expect(checkType('1', 'integer').ok).toBe(false)
  })

  it('any admits every domain value including null and opaque constants', () => {
    expect(checkType(null, 'any').ok).toBe(true)
    expect(checkType({ a: 1 }, 'any').ok).toBe(true)
    expect(checkType([1, 2], 'any').ok).toBe(true)
    expect(checkType(0, 'any').ok).toBe(true)
    expect(checkType(() => 1, 'any').ok).toBe(true)
  })

  it('reports expected vs actual on a mismatch', () => {
    const result = checkType(1, 'string')
    expect(result).toEqual({ ok: false, expected: 'string', actual: 'number' })
  })
})

describe('checkType — unions and literals', () => {
  it('a union passes when any member matches', () => {
    const union: ['number', 'null'] = ['number', 'null']
    expect(checkType(5, union).ok).toBe(true)
    expect(checkType(null, union).ok).toBe(true)
    expect(checkType('x', union)).toEqual({
      ok: false,
      expected: 'number | null',
      actual: 'string',
    })
  })

  it('a literal set admits only its members', () => {
    const lit = { literal: ['number', 'string', 'boolean'] }
    expect(checkType('string', lit).ok).toBe(true)
    expect(checkType('boolean', lit).ok).toBe(true)
    expect(checkType('array', lit).ok).toBe(false)
    expect(checkType(1, lit).ok).toBe(false)
  })

  it('isLiteralType distinguishes the three forms', () => {
    expect(isLiteralType({ literal: ['a'] })).toBe(true)
    expect(isLiteralType('string')).toBe(false)
    expect(isLiteralType(['number', 'null'])).toBe(false)
  })
})

describe('describeType', () => {
  it('names the runtime shape', () => {
    expect(describeType(null)).toBe('null')
    expect(describeType([1])).toBe('array')
    expect(describeType({})).toBe('object')
    expect(describeType('x')).toBe('string')
    expect(describeType(1)).toBe('number')
    expect(describeType(true)).toBe('boolean')
  })
})

describe('checkConstraints — length', () => {
  it('requires exact arity', () => {
    expect(checkConstraints([1, 2], { length: 2 }).ok).toBe(true)
    expect(checkConstraints([1], { length: 2 })).toEqual({
      ok: false,
      expected: 'array of length 2',
      actual: 'array of length 1',
    })
    expect(checkConstraints('nope', { length: 2 }).ok).toBe(false)
  })
})

describe('checkConstraints — homogeneous', () => {
  const constraints: Constraints = { homogeneous: ['number', 'string'] }

  it('passes when all elements share one allowed type', () => {
    expect(checkConstraints([1, 2, 3], constraints).ok).toBe(true)
    expect(checkConstraints(['a', 'b'], constraints).ok).toBe(true)
    expect(checkConstraints([], constraints).ok).toBe(true) // vacuously homogeneous
  })

  it('fails on mixed element types or a disallowed type', () => {
    expect(checkConstraints([1, 'a'], constraints).ok).toBe(false)
    expect(checkConstraints([true, false], constraints).ok).toBe(false)
  })
})

describe('checkConstraints — elementShape', () => {
  const constraints: Constraints = {
    elementShape: {
      key: { type: 'string' },
      value: { type: 'any' },
      note: { type: 'string', required: false },
    },
  }

  it('passes matching entries and allows an absent optional key', () => {
    expect(checkConstraints([{ key: 'a', value: 1 }], constraints).ok).toBe(true)
    expect(checkConstraints([{ key: 'a', value: null, note: 'hi' }], constraints).ok).toBe(true)
  })

  it('fails a missing required key or a wrong value type', () => {
    expect(checkConstraints([{ value: 1 }], constraints).ok).toBe(false) // missing required 'key'
    expect(checkConstraints([{ key: 1, value: 1 }], constraints).ok).toBe(false) // 'key' not string
    expect(checkConstraints([42], constraints).ok).toBe(false) // element not an object
  })
})

describe('checkConstraints — empty constraints', () => {
  it('is a no-op regardless of value', () => {
    expect(checkConstraints('anything', {}).ok).toBe(true)
    expect(checkConstraints(42, {}).ok).toBe(true)
  })
})
