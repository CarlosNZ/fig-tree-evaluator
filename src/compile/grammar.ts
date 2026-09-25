/**
 * The pure grammar the compiler and `./format` share ("What the walk
 * visits" and "The positional mapping is shared, not copied" in
 * docs-dev/v3-specs/v3-format.md): how an object is classified, which keys
 * may sit beside a shorthand key, and how a positional payload maps to named
 * parameters. Both callers must read an expression the same way, so these
 * are stated once, here, with no knowledge of the registry beyond what each
 * caller passes in.
 *
 * Kept free of heavy imports on purpose: `./format` imports this module, so
 * everything it reaches lands in the chunk the subpath shares with the root.
 */
import { ErrorCodes } from '../errorCodes'

/** Reserved keys legal beside a `$name` shorthand key (the sibling rule). */
export const SHORTHAND_SIBLINGS: ReadonlySet<string> = new Set([
  'fallback',
  'useCache',
  'vars',
  '//',
])

/**
 * The built-in, option-independent nesting ceiling for the compile walk,
 * the constancy probe and the format walk. Measured September 2026 on
 * Node's default stack: the walk survives 1,000 input levels and overflows
 * before 1,500; browsers allow less, so the ceiling sits well inside both.
 */
export const DEPTH_CEILING = 500

/**
 * What an object is, by its keys. `malformed` carries the compiler's code
 * and message: the compiler reports it as an issue, `./format` throws it.
 */
export type ObjectClass =
  | { kind: 'operator' }
  | { kind: 'fragment' }
  | { kind: 'shorthand'; key: string }
  | { kind: 'plain' }
  | { kind: 'malformed'; code: string; message: string }

// The results without a payload are shared: the compiler classifies every
// object it visits, so only a shorthand or malformed one allocates
const OPERATOR: ObjectClass = { kind: 'operator' }
const FRAGMENT: ObjectClass = { kind: 'fragment' }
const PLAIN: ObjectClass = { kind: 'plain' }

const malformed = (message: string): ObjectClass => ({
  kind: 'malformed',
  code: ErrorCodes.malformedNode,
  message,
})

/**
 * Classify an object by its keys, in the grammar's order: two invocations
 * on one object are ambiguous, so they are malformed before either is read.
 * `recognizes` answers whether a `$name` key invokes something the caller
 * knows (`literal`, a registered operator or alias, or a fragment); an
 * unrecognized `$name` is data, so it leaves the object plain.
 */
export const classifyObject = (
  raw: Record<string, unknown>,
  recognizes: (name: string) => boolean
): ObjectClass => {
  const hasOperator = 'operator' in raw
  const hasFragment = 'fragment' in raw
  const shorthand: string[] = []
  for (const key in raw) {
    if (key.startsWith('$') && recognizes(key.slice(1))) shorthand.push(key)
  }

  if (hasOperator && hasFragment) return malformed("'operator' and 'fragment' may not share a node")
  if ((hasOperator || hasFragment) && shorthand.length > 0)
    return malformed(
      `a canonical '${hasOperator ? 'operator' : 'fragment'}' key may not sit beside the shorthand key '${shorthand[0]}'`
    )
  if (hasOperator) return OPERATOR
  if (hasFragment) return FRAGMENT
  if (shorthand.length >= 2)
    return malformed(
      `one node, one invocation: found ${shorthand.map((key) => `'${key}'`).join(' and ')}`
    )
  if (shorthand.length === 1) return { kind: 'shorthand', key: shorthand[0] }
  return PLAIN
}

/** The part of an operator's definition the positional grammar reads. */
export interface PositionalShape {
  positionalParams?: readonly string[]
  restParam: string | null
}

/**
 * How an array payload of `length` elements binds: `bound` leading
 * positions from index 0, then, when `restAt` is a number, the rest
 * parameter takes the slice from `restAt` on. `null` when the shape has no
 * positional form, or the payload is longer than the leading positions with
 * no rest to take the surplus. A layout rather than the bound values, so
 * the compiler can keep each value's payload index without allocating.
 */
export interface PositionalLayout {
  bound: number
  restAt: number | null
}

export const positionalLayout = (
  shape: PositionalShape,
  length: number
): PositionalLayout | null => {
  const positional = shape.positionalParams
  if (positional === undefined) return null
  const rest = shape.restParam
  // A rest entry is always the last positional one (`defineOperator`
  // enforces it), so the leading entries are the list up to it
  const leading = rest === null ? positional.length : positional.length - 1
  if (length > leading && rest === null) return null
  // The rest slice binds whenever the payload fills the leading positions —
  // an empty payload binds an empty array ({ $and: [] } → values: []),
  // which is the vacuous-identity / empty-aggregate case the passes define,
  // not an omission
  return {
    bound: Math.min(length, leading),
    restAt: rest !== null && length >= leading ? leading : null,
  }
}

/**
 * An array payload as named parameters, in positional order: the leading
 * positions left to right, then the rest slice (the payload itself where
 * nothing leads it). Entries rather than an object, so a parameter whose
 * name is integer-like cannot move ahead of the others. `null` as for
 * `positionalLayout`.
 */
export const positionalToNamed = (
  shape: PositionalShape,
  payload: readonly unknown[]
): [string, unknown][] | null => {
  const layout = positionalLayout(shape, payload.length)
  if (layout === null) return null
  const positional = shape.positionalParams!
  const named: [string, unknown][] = []
  for (let i = 0; i < layout.bound; i++) named.push([positional[i], payload[i]])
  if (layout.restAt !== null)
    named.push([shape.restParam!, layout.restAt === 0 ? payload : payload.slice(layout.restAt)])
  return named
}

/**
 * The parameter a single non-array payload binds, verbatim: the first
 * position, or the rest parameter when the rest comes first. `null` when
 * the shape has no positional form.
 */
export const singlePositionalTarget = (shape: PositionalShape): string | null => {
  const first = shape.positionalParams?.[0]
  if (first === undefined) return null
  return first.startsWith('...') ? shape.restParam : first
}
