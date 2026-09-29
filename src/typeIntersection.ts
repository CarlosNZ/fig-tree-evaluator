/**
 * Whether two type declarations overlap, stated once for the static
 * feeding-position check and for tools that must agree with it (the
 * editor's operator picker, through `./format`).
 *
 * Kept free of value imports on purpose: `./format` imports this module, so
 * everything it reaches lands in the chunk the subpath shares with the root.
 * The type vocabulary itself stays in typeCheck.ts, whose checks the
 * subpath never needs.
 */
import type { BasicType, ExpectedType, LiteralType } from './typeCheck'

export const isLiteralType = (expected: ExpectedType): expected is LiteralType =>
  typeof expected === 'object' &&
  expected !== null &&
  !Array.isArray(expected) &&
  'literal' in expected

/**
 * Do two type declarations admit any common value? Powers the static
 * feeding-position check ("returns" in
 * docs-dev/v3-specs/v3-operator-contract.md): a node whose declared
 * `returns` has an empty intersection with the receiving parameter's type
 * is a static error. `any` intersects everything; `integer` intersects
 * `number`; literal-union members intersect a basic type by their runtime
 * type, and two literal unions by shared members.
 */
export const typesIntersect = (a: ExpectedType, b: ExpectedType): boolean => {
  const left = normalizeForIntersection(a)
  const right = normalizeForIntersection(b)
  if (left.any || right.any) return true

  // literal × literal: a shared member
  if (left.literals !== undefined && right.literals !== undefined)
    return left.literals.some((member) => right.literals!.includes(member))

  // literal × basics: some member's runtime type is admitted
  if (left.literals !== undefined) return left.literals.some((m) => literalMatches(m, right.basics))
  if (right.literals !== undefined)
    return right.literals.some((m) => literalMatches(m, left.basics))

  // basics × basics: shared member, with the integer/number bridge
  return left.basics.some(
    (type) =>
      right.basics.includes(type) ||
      (type === 'integer' && right.basics.includes('number')) ||
      (type === 'number' && right.basics.includes('integer'))
  )
}

const normalizeForIntersection = (
  expected: ExpectedType
): {
  any: boolean
  basics: readonly BasicType[]
  literals?: readonly (string | number | boolean)[]
} => {
  if (isLiteralType(expected)) return { any: false, basics: [], literals: expected.literal }
  const basics: readonly BasicType[] = typeof expected === 'string' ? [expected] : expected
  return { any: basics.includes('any'), basics }
}

const literalMatches = (
  member: string | number | boolean,
  basics: readonly BasicType[]
): boolean => {
  if (typeof member === 'string') return basics.includes('string')
  if (typeof member === 'boolean') return basics.includes('boolean')
  return basics.includes('number') || (Number.isInteger(member) && basics.includes('integer'))
}
