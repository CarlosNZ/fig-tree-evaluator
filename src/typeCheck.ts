/**
 * Type checking against the operator-metadata vocabulary ("Metadata type
 * vocabulary" in docs-dev/v3-specs/v3-api.md, "Constraints" in
 * docs-dev/v3-specs/v3-operator-contract.md).
 *
 * One table, three moments: registration validates declarations and their
 * defaults; `validate()` checks literal argument values at parse; the runtime
 * checks dynamic values as they arrive. This module owns the table and returns
 * a *structured* `TypeCheckResult` that each moment adapts — a registration
 * throw, a parse-time `Issue`, or a runtime `FigTreeError` (all code
 * `type-check`). v2 accumulated joined strings ([v2-src/typeCheck.ts]); v3
 * keeps the token set and the single/union/literal dispatch but returns
 * structure, and changes `any` to admit `null` (there is no `undefined` in the
 * v3 domain).
 */

import { isPlainObject } from './utils'

export type BasicType =
  | 'any' // every domain value, INCLUDING null, plus opaque constants
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null'
  | 'integer' // a refinement of number (e.g. round's `decimals`)

/** A closed set of allowed literal values (e.g. convert's `to`). */
export type LiteralType = { literal: Array<string | number | boolean> }

/** A single basic type, a closed literal set, or a union of basic types. */
export type ExpectedType = BasicType | LiteralType | BasicType[]

export interface Constraints {
  /** Exact array arity. */
  length?: number
  /** All elements are one basic type, drawn from this allowed list. */
  homogeneous?: BasicType[]
  /**
   * Each element is an object of this shape (fragment-style, required by
   * default).
   */
  elementShape?: Record<string, TypeDeclaration>
}

/**
 * The minimal parameter declaration `elementShape` needs. Phase 2's
 * `defineOperator` extends this into the full parameter-declaration shape.
 */
export interface TypeDeclaration {
  type?: ExpectedType
  required?: boolean
  constraints?: Constraints
}

export type TypeCheckResult = { ok: true } | { ok: false; expected: string; actual: string }

const OK: TypeCheckResult = { ok: true }

/** The runtime shape of a value, for the `actual` slot of a failure. */
export const describeType = (value: unknown): string => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value // 'string' | 'number' | 'boolean' | 'object' | 'function' | 'undefined' | ...
}

const fail = (expected: string, value: unknown): TypeCheckResult => ({
  ok: false,
  expected,
  actual: describeType(value),
})

const matchesBasic = (value: unknown, type: BasicType): boolean => {
  switch (type) {
    case 'any':
      return true // includes null and opaque constants
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isPlainObject(value)
    case 'null':
      return value === null
    default:
      return false
  }
}

export const isLiteralType = (expected: ExpectedType): expected is LiteralType =>
  typeof expected === 'object' &&
  expected !== null &&
  !Array.isArray(expected) &&
  'literal' in expected

/** Check a single value against a declared type. */
export const checkType = (value: unknown, expected: ExpectedType): TypeCheckResult => {
  if (isLiteralType(expected)) {
    if (expected.literal.indexOf(value as string | number | boolean) !== -1) return OK
    const allowed = expected.literal.map((v) => JSON.stringify(v)).join(', ')
    return fail(`one of ${allowed}`, value)
  }

  if (Array.isArray(expected)) {
    return expected.some((t) => matchesBasic(value, t)) ? OK : fail(expected.join(' | '), value)
  }

  return matchesBasic(value, expected) ? OK : fail(expected, value)
}

/** Check an array value against array-shape constraints. */
export const checkConstraints = (value: unknown, constraints: Constraints): TypeCheckResult => {
  if (constraints.length !== undefined) {
    if (!Array.isArray(value)) return fail('array', value)
    if (value.length !== constraints.length)
      return {
        ok: false,
        expected: `array of length ${constraints.length}`,
        actual: `array of length ${value.length}`,
      }
  }

  if (constraints.homogeneous) {
    if (!Array.isArray(value)) return fail('array', value)
    const allowed = constraints.homogeneous
    if (value.length > 0) {
      const matching = allowed.find((t) => (value as unknown[]).every((el) => matchesBasic(el, t)))
      if (matching === undefined)
        return {
          ok: false,
          expected: `homogeneous array of ${allowed.join(' | ')}`,
          actual: 'mixed types',
        }
    }
  }

  if (constraints.elementShape) {
    if (!Array.isArray(value)) return fail('array', value)
    for (let i = 0; i < value.length; i++) {
      const result = checkElementShape(value[i], constraints.elementShape)
      if (!result.ok) return result
    }
  }

  return OK
}

const checkElementShape = (
  element: unknown,
  shape: Record<string, TypeDeclaration>
): TypeCheckResult => {
  if (!isPlainObject(element)) return fail('object', element)

  const keys = Object.keys(shape)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const declaration = shape[key]
    const present = Object.prototype.hasOwnProperty.call(element, key)
    const required = declaration.required !== false // required by default

    if (!present) {
      if (required) return { ok: false, expected: `property "${key}"`, actual: 'missing' }
      continue
    }
    if (declaration.type !== undefined) {
      const typed = checkType(element[key], declaration.type)
      if (!typed.ok) return typed
    }
    if (declaration.constraints !== undefined) {
      const constrained = checkConstraints(element[key], declaration.constraints)
      if (!constrained.ok) return constrained
    }
  }

  return OK
}
