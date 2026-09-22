/**
 * The content-layer serializer ("Cache keying for non-identical inputs" in
 * docs-dev/v3-specs/v3-implementation-notes.md; artifact obligation C5).
 *
 * Only two properties matter. It must be injective over what it accepts,
 * because two inputs sharing a key means serving the wrong artifact; and
 * it must refuse anything that cannot be keyed by content, because a
 * refusal only skips the layer.
 */
import { serializeInput } from '../src/compile/contentKey'
import { compileExpression, DEPTH_CEILING } from '../src/compile'
import { buildRegistry } from '../src/registry'
import { coreOperators } from '../src/operators'

const key = (value: unknown) => serializeInput(value)

/** Every pair here must serialize differently. */
const distinct: [string, unknown, unknown][] = [
  ['a number and its string', 1, '1'],
  ['an object and its entry list', { a: 1 }, [['a', 1]]],
  ['key order', { a: 1, b: 2 }, { b: 2, a: 1 }],
  ['an explicit undefined and an absent key', { a: undefined }, {}],
  ['a null and an undefined', { a: null }, { a: undefined }],
  ['NaN and null', NaN, null],
  ['negative zero and zero', -0, 0],
  ['Infinity and its negative', Infinity, -Infinity],
  ['a nested array and a flat one', [['a', 'b']], ['a', 'b']],
  ['strings that would run together', ['a', 'b'], ['a,b']],
  ['a string containing the delimiters', ['}{'], ['{}']],
  ['true and its string', true, 'true'],
]

describe('injectivity', () => {
  it.each(distinct)('%s', (_name, left, right) => {
    expect(key(left)).toBeDefined()
    expect(key(right)).toBeDefined()
    expect(key(left)).not.toBe(key(right))
  })

  it('is stable for equal content spelled the same way', () => {
    const value = { a: [1, 'two', null], b: { c: true } }
    expect(key(value)).toBe(key(JSON.parse(JSON.stringify(value))))
  })
})

describe('refusal', () => {
  it.each([
    ['a Date', new Date(0)],
    ['a Map', new Map()],
    ['a Set', new Set()],
    ['a RegExp', /x/],
    ['a class instance', new (class Holder {})()],
    ['a function', () => 1],
    ['a bigint', BigInt(1)],
    ['a symbol', Symbol('x')],
  ])('refuses %s', (_name, value) => {
    expect(key(value)).toBeUndefined()
  })

  it('refuses a non-plain value however deeply it is buried', () => {
    expect(key({ a: { b: [{ c: new Date(0) }] } })).toBeUndefined()
  })

  it('refuses past the depth ceiling instead of overflowing the stack', () => {
    let deep: unknown = 'bottom'
    for (let i = 0; i <= DEPTH_CEILING + 5; i++) deep = [deep]
    expect(key(deep)).toBeUndefined()
  })

  it('refuses a cyclic input without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => key(cyclic)).not.toThrow()
    expect(key(cyclic)).toBeUndefined()
  })
})

describe('agreement with the compiler’s own guard', () => {
  const registry = buildRegistry({ operators: [coreOperators] })

  // The two guards are independent, and this is the direction that must
  // hold: anything the serializer accepts is safe for the content layer.
  // The converse is deliberately not asserted — the serializer is stricter,
  // which is what covers opaque values under `literal`.
  it.each([
    ['a plain expression', { $plus: [1, 2] }],
    ['a nested config', { a: { b: ['$data.x', 2] }, c: null }],
    ['a bare value', 42],
    ['an array of primitives', [1, 'two', true, null]],
  ])('%s: accepted ⇒ the artifact is not identity-only', (_name, expression) => {
    expect(key(expression)).toBeDefined()
    expect(compileExpression(expression, registry).identityOnly).toBe(false)
  })

  it('refuses an opaque value under literal, which the compiler never walks', () => {
    const expression = { $literal: { stamp: new Date(0) } }
    // The compiler cannot see it — `literal` contents are taken verbatim
    expect(compileExpression(expression, registry).identityOnly).toBe(false)
    // The serializer walks the raw input, so the content layer is protected
    expect(key(expression)).toBeUndefined()
  })
})
