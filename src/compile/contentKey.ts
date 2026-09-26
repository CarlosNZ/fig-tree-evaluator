/**
 * The content-layer key ("Cache keying for non-identical inputs" in
 * docs-dev/v3-specs/v3-implementation-notes.md), and the serializer behind
 * it.
 *
 * The key is native `JSON.stringify` wherever JSON text spells the input
 * exactly, and the serializer below everywhere else. `JSON.stringify` alone
 * would throw on a cycle, honour a `toJSON` method, drop `undefined` and
 * functions, and flatten `NaN`, `±Infinity`, `-0`, `Date`s and `Map`s —
 * and every one of those either crashes the lookup or makes two different
 * inputs serialize alike, which in a cache means serving the wrong
 * artifact. So a checking walk goes first and sends each of those cases to
 * the serializer or to refusal. What it leaves is plain JSON data, where
 * `JSON.stringify` is injective and about twice as fast: it writes into
 * one native buffer, where the serializer builds a string per token and
 * joins them.
 *
 * The serializer's grammar is self-delimiting and length-prefixes strings,
 * so it needs no escaping pass and no delimiter can collide. It is never
 * parsed back; the only property that matters is injectivity over the
 * inputs it accepts, and a refusal is always safe because it just skips
 * the layer.
 *
 * The key string IS the key — it is not hashed. A `Map` keyed on a string
 * hashes it natively and then verifies with full equality, so a
 * hand-rolled digest would swap a verified hash for an unverified one
 * whose collision serves the wrong artifact, silently. Staying sound means
 * retaining the full string in the entry and comparing it on a bucket
 * match anyway, and what that buys is bounded at both ends: the native
 * hash is the larger half of a lookup only below V8's content-hash
 * ceiling of 16383 characters, and the retained key is already bounded by
 * the LRU's bound.
 *
 * Key order is preserved rather than sorted: two spellings of the same
 * object are a deliberate miss, not something to canonicalize.
 */
import { isPlainDataObject } from '../utils'
import { DEPTH_CEILING } from './grammar'

/**
 * The content-layer key, or `undefined` where the input holds something
 * that cannot be keyed by content.
 *
 * The refusal IS the non-plain-value guard, and it is the load-bearing
 * half of the pair: the compiler's `identityOnly` flag only sees values it
 * walks, and a `literal` payload is never walked, so an opaque value
 * inside one would slip past it. Both routes walk the raw input instead.
 */
export const contentKey = (value: unknown): string | undefined => {
  const route = spelling(value, 0)
  if (route === 'json') return JSON.stringify(value)
  if (route === 'serializer') return serialize(value, [SERIALIZED])
  return undefined
}

/**
 * Keeps the serializer's keys apart from `JSON.stringify`'s. The two
 * grammars almost certainly cannot spell two inputs alike, but a cache
 * should not rest on that argument: JSON text never begins with `~`. The
 * mark is the serializer's first token, so the key is still one flat
 * string, where a concatenation would be copied again when the `Map`
 * hashes it.
 */
const SERIALIZED = '~'

/**
 * Longer strings take the serializer, which never looks inside a string.
 * `JSON.stringify` scans every character for escaping — on Node 22 about
 * 1.7 ns a character past 243 — where the serializer stays flat, but it
 * saves far more than that on structure. So where the two break even
 * depends on the input's size: a string of about 1,000 characters in a
 * one-hole expression, 6,000 in a 50-section config, past 50,000 in a
 * 500-section one. The limit sits where a tiny expression holding a
 * string just under it pays about 7 µs, and a mid-sized config keeps
 * the faster route. One string over it sends the whole input to the
 * serializer. Measured on one engine; re-measure on the runtimes that
 * matter.
 */
const LONG_STRING = 4096

/**
 * Which route spells the input: `json` for plain JSON data, `serializer`
 * for what only the serializer spells faithfully, `refused` for what
 * nothing can key by content.
 *
 * `undefined` takes the serializer. JSON drops it from an object and
 * writes `null` for it in an array, which is the compiler's own
 * normalization everywhere it walks — but a `literal` payload is taken
 * verbatim, so there `[undefined]` and `[null]` evaluate differently and
 * must not share a key. An input straight from JSON never holds one.
 *
 * The walk stops at the first value that needs the serializer, which does
 * its own refusing, so a refused value later in the input is still
 * refused.
 */
const spelling = (value: unknown, depth: number): 'json' | 'serializer' | 'refused' => {
  if (depth > DEPTH_CEILING) return 'refused'
  switch (typeof value) {
    case 'boolean':
      return 'json'
    case 'string':
      return value.length > LONG_STRING ? 'serializer' : 'json'
    case 'number':
      return Number.isFinite(value) && !Object.is(value, -0) ? 'json' : 'serializer'
    case 'undefined':
      return 'serializer'
    case 'object':
      break
    default:
      return 'refused'
  }
  if (value === null) return 'json'
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const route = spelling(value[i], depth + 1)
      if (route !== 'json') return route
    }
    return 'json'
  }
  if (!isPlainDataObject(value)) return 'refused'
  for (const key in value) {
    if (key.length > LONG_STRING) return 'serializer'
    const route = spelling(value[key], depth + 1)
    if (route !== 'json') return route
  }
  return 'json'
}

/**
 * The serialized form, or `undefined` where the input holds something
 * that cannot be keyed by content. The content layer reaches it through
 * `contentKey`; the result cache's keys use it directly.
 *
 * TO-DO: one key function for both caches (#183).
 */
export const serializeInput = (value: unknown): string | undefined => serialize(value, [])

const serialize = (value: unknown, out: string[]): string | undefined =>
  write(value, 0, out) ? out.join('') : undefined

const write = (value: unknown, depth: number, out: string[]): boolean => {
  if (depth > DEPTH_CEILING) return false

  if (value === null) return push(out, 'n')
  if (value === undefined) return push(out, 'u')
  switch (typeof value) {
    case 'boolean':
      return push(out, value ? 't' : 'f')
    case 'number':
      return writeNumber(value, out)
    case 'string':
      return push(out, `s${value.length}:${value}`)
    case 'object':
      break
    default:
      // function, symbol, bigint — outside the value domain entirely
      return false
  }

  if (Array.isArray(value)) {
    out.push('[')
    for (const element of value) if (!write(element, depth + 1, out)) return false
    return push(out, ']')
  }
  if (!isPlainDataObject(value)) return false
  out.push('{')
  for (const key in value) {
    out.push(`s${key.length}:${key}`)
    if (!write(value[key], depth + 1, out)) return false
  }
  return push(out, '}')
}

/**
 * The three numbers JSON cannot spell get their own tokens, and negative
 * zero is kept distinct from zero: flattening either pair would let two
 * different expressions share a key.
 */
const writeNumber = (value: number, out: string[]): boolean => {
  if (Number.isNaN(value)) return push(out, 'N')
  if (value === Infinity) return push(out, 'I')
  if (value === -Infinity) return push(out, 'J')
  if (Object.is(value, -0)) return push(out, '#-0')
  return push(out, `#${String(value)}`)
}

const push = (out: string[], token: string): boolean => {
  out.push(token)
  return true
}
