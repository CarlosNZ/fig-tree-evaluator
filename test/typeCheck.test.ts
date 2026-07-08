import {
  checkType,
  checkConstraints,
  describeType,
  isLiteralType,
  isExpectedType,
  validateConstraintsShape,
  type Constraints,
} from '../src'

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

describe('isExpectedType — validating type expressions (Phase 2)', () => {
  it('accepts every basic token', () => {
    for (const token of [
      'any',
      'string',
      'number',
      'boolean',
      'array',
      'object',
      'null',
      'integer',
    ]) {
      expect(isExpectedType(token)).toBe(true)
    }
  })

  it('accepts unions of basic tokens and literal sets', () => {
    expect(isExpectedType(['number', 'null'])).toBe(true)
    expect(isExpectedType({ literal: ['a', 1, true] })).toBe(true)
  })

  it('rejects unknown tokens, empty forms and malformed members', () => {
    expect(isExpectedType('text')).toBe(false)
    expect(isExpectedType(['number', 'text'])).toBe(false)
    expect(isExpectedType([])).toBe(false) // an empty union means nothing
    expect(isExpectedType({ literal: [] })).toBe(false) // an empty literal set admits nothing
    expect(isExpectedType({ literal: ['a', null] })).toBe(false)
    expect(isExpectedType({ literal: 'a' })).toBe(false)
    expect(isExpectedType(5)).toBe(false)
    expect(isExpectedType(undefined)).toBe(false)
  })
})

describe('validateConstraintsShape — validating constraint declarations (Phase 2)', () => {
  it('accepts each documented constraint', () => {
    expect(validateConstraintsShape({ length: 2 }).ok).toBe(true)
    expect(validateConstraintsShape({ homogeneous: ['number', 'string'] }).ok).toBe(true)
    expect(
      validateConstraintsShape({
        elementShape: {
          key: { type: 'string' },
          value: { type: 'any' },
          note: { type: 'string', required: false },
        },
      }).ok
    ).toBe(true)
    expect(validateConstraintsShape({}).ok).toBe(true)
  })

  it('rejects non-objects, unknown keys and malformed values', () => {
    expect(validateConstraintsShape('nope').ok).toBe(false)
    expect(validateConstraintsShape({ arity: 2 }).ok).toBe(false) // unknown key
    expect(validateConstraintsShape({ length: 'two' }).ok).toBe(false)
    expect(validateConstraintsShape({ length: -1 }).ok).toBe(false)
    expect(validateConstraintsShape({ length: 1.5 }).ok).toBe(false)
    expect(validateConstraintsShape({ homogeneous: [] }).ok).toBe(false)
    expect(validateConstraintsShape({ homogeneous: ['text'] }).ok).toBe(false)
    expect(validateConstraintsShape({ elementShape: [] }).ok).toBe(false)
    expect(validateConstraintsShape({ elementShape: { key: { type: 'text' } } }).ok).toBe(false)
    expect(validateConstraintsShape({ elementShape: { key: { required: 'yes' } } }).ok).toBe(false)
  })

  it('recurses through nested elementShape constraints', () => {
    const nested = {
      elementShape: {
        rows: { type: 'array', constraints: { homogeneous: ['number'] } },
      },
    }
    expect(validateConstraintsShape(nested).ok).toBe(true)
    const badNested = {
      elementShape: {
        rows: { type: 'array', constraints: { length: 'two' } },
      },
    }
    expect(validateConstraintsShape(badNested).ok).toBe(false)
  })
})
