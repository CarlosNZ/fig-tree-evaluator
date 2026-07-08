import { resolvePath, parsePath, WILDCARD } from '../src'

describe('parsePath', () => {
  it('parses dot, index, wildcard and quoted-bracket forms', () => {
    expect(parsePath('a.b.c')).toEqual(['a', 'b', 'c'])
    expect(parsePath('users[0].name')).toEqual(['users', 0, 'name'])
    expect(parsePath('list[*].id')).toEqual(['list', WILDCARD, 'id'])
    expect(parsePath('settings["a.b"]')).toEqual(['settings', 'a.b'])
    expect(parsePath('')).toEqual([])
  })

  it('throws on malformed input', () => {
    expect(() => parsePath('a[')).toThrow(/Invalid path/)
    expect(() => parsePath('a["unterminated]')).toThrow(/Invalid path/)
    expect(() => parsePath('a[x]')).toThrow(/Invalid path/)
  })
})

describe('resolvePath — basics', () => {
  it('resolves dotted paths and array indices', () => {
    expect(resolvePath({ a: { b: { c: 1 } } }, 'a.b.c')).toEqual({ found: true, value: 1 })
    expect(resolvePath({ users: [{ name: 'x' }] }, 'users[0].name')).toEqual({
      found: true,
      value: 'x',
    })
  })

  it('returns the whole source for an empty path', () => {
    const src = { a: 1 }
    expect(resolvePath(src, '')).toEqual({ found: true, value: src })
    expect(resolvePath(src, [])).toEqual({ found: true, value: src })
  })

  it('distinguishes a genuine stored null from a miss', () => {
    expect(resolvePath({ a: null }, 'a')).toEqual({ found: true, value: null })
    expect(resolvePath({ a: 1 }, 'b')).toEqual({ found: false, value: undefined })
  })

  it('drills through null / scalars to a miss — no string .length leakage', () => {
    expect(resolvePath({ a: null }, 'a.b').found).toBe(false)
    expect(resolvePath({ name: 'Bob' }, 'name.length').found).toBe(false)
    expect(resolvePath([1, 2], 'length').found).toBe(false)
  })

  it('indexes arrays however the numeric segment is spelled', () => {
    expect(resolvePath(['a', 'b'], '[1]')).toEqual({ found: true, value: 'b' })
    expect(resolvePath(['a', 'b'], '1')).toEqual({ found: true, value: 'b' })
    expect(resolvePath({ '0': 'x' }, '0')).toEqual({ found: true, value: 'x' })
    expect(resolvePath(['a'], '[5]').found).toBe(false)
  })
})

describe('resolvePath — [*] projection', () => {
  const data = {
    user: { weapons: [{ name: 'Blaster' }, { name: 'Seismic charge' }] },
  }

  it('maps the remainder over an array', () => {
    expect(resolvePath(data, 'user.weapons[*].name')).toEqual({
      found: true,
      value: ['Blaster', 'Seismic charge'],
    })
  })

  it('yields null in a slot where an element misses', () => {
    expect(resolvePath({ w: [{ name: 'a' }, {}] }, 'w[*].name')).toEqual({
      found: true,
      value: ['a', null],
    })
  })

  it('treats a trailing [*] as the identity projection', () => {
    expect(resolvePath({ arr: [1, 2] }, 'arr[*]')).toEqual({ found: true, value: [1, 2] })
  })

  it('misses when [*] is applied to a non-array', () => {
    expect(resolvePath({ arr: 'nope' }, 'arr[*]').found).toBe(false)
  })
})

describe('resolvePath — quoted keys and segments arrays', () => {
  it('reads keys containing dots and brackets via quoted brackets', () => {
    expect(resolvePath({ settings: { 'a.b': 5 } }, 'settings["a.b"]')).toEqual({
      found: true,
      value: 5,
    })
    expect(resolvePath({ 'weird [key]': 9 }, '["weird [key]"]')).toEqual({ found: true, value: 9 })
  })

  it('honours backslash escapes inside quoted keys', () => {
    expect(resolvePath({ 'a"b': 1 }, '["a\\"b"]')).toEqual({ found: true, value: 1 })
  })

  it('takes segments-array string elements as verbatim keys', () => {
    expect(resolvePath({ users: [{ 'first.name': 'Jango' }] }, ['users', 0, 'first.name'])).toEqual(
      { found: true, value: 'Jango' }
    )
  })
})

describe('resolvePath — prototype safety', () => {
  it('never reaches inherited / non-own properties', () => {
    expect(resolvePath({}, '__proto__').found).toBe(false)
    expect(resolvePath({}, 'constructor').found).toBe(false)
    expect(resolvePath({ a: 1 }, 'constructor.name').found).toBe(false)
    expect(resolvePath({ a: 1 }, 'toString').found).toBe(false)
  })
})
