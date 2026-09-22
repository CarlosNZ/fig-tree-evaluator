/**
 * The content-layer key ("Cache keying for non-identical inputs" in
 * docs-dev/v3-specs/v3-implementation-notes.md).
 *
 * Deliberately not `JSON.stringify`. That would throw on a cycle, honour a
 * `toJSON` method, drop `undefined` and functions, and flatten `NaN`,
 * `±Infinity`, `-0`, `Date`s and `Map`s — and every one of those either
 * crashes the lookup or makes two different inputs serialize alike, which
 * in a cache means serving the wrong artifact.
 *
 * The grammar is self-delimiting and length-prefixes strings, so it needs
 * no escaping pass and no delimiter can collide. It is never parsed back;
 * the only property that matters is injectivity over the inputs it
 * accepts, and a refusal is always safe because it just skips the layer.
 *
 * The serialized string IS the key — it is not hashed. A `Map` keyed on a
 * string hashes it natively and then verifies with full equality, so a
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
import { DEPTH_CEILING } from './probe'

/**
 * The serialized form, or `undefined` where the input holds something
 * that cannot be keyed by content.
 *
 * The refusal IS the non-plain-value guard, and it is the load-bearing
 * half of the pair: the compiler's `identityOnly` flag only sees values it
 * walks, and a `literal` payload is never walked, so an opaque value
 * inside one would slip past it. This walks the raw input instead.
 */
export const serializeInput = (value: unknown): string | undefined => {
  const out: string[] = []
  return write(value, 0, out) ? out.join('') : undefined
}

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
  for (const [key, child] of Object.entries(value)) {
    out.push(`s${key.length}:${key}`)
    if (!write(child, depth + 1, out)) return false
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
