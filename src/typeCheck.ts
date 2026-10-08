/**
 * Type checking against the operator-metadata vocabulary ("Metadata type
 * vocabulary" in docs-dev/v3-specs/v3-api.md, "Constraints" in
 * docs-dev/v3-specs/v3-operator-contract.md).
 *
 * One table, three moments: registration validates declarations and their
 * defaults; `validate()` checks literal argument values at compile; the runtime
 * checks dynamic values as they arrive. This module owns the table and returns
 * a *structured* `TypeCheckResult` that each moment adapts — a registration
 * throw, a compile-time `Issue`, or a runtime `FigTreeError` (all code
 * `type-check`). v2 accumulated joined strings ([v2-src/typeCheck.ts]); v3
 * keeps the token set and the single/union/literal dispatch but returns
 * structure, and changes `any` to admit `null` (there is no `undefined` in the
 * v3 domain).
 */

import { isLiteralType } from './typeIntersection'
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
export type LiteralType = { literal: readonly (string | number | boolean)[] }

/** A single basic type, a closed literal set, or a union of basic types. */
export type ExpectedType = BasicType | LiteralType | readonly BasicType[]

export interface Constraints {
  /** Exact array arity. */
  length?: number
  /** All elements are one basic type, drawn from this allowed list. */
  homogeneous?: readonly BasicType[]
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

/**
 * Does a declared type admit `null`? The type-driven admission question
 * ("Null policy" in docs-dev/v3-specs/v3-api.md): a type without `null` IS
 * the reject declaration. `any` names null. Literal unions never do.
 */
export const typeNamesNull = (type: ExpectedType): boolean => {
  if (type === 'null' || type === 'any') return true
  if (Array.isArray(type)) return type.includes('null') || type.includes('any')
  return false
}

const BASIC_TYPES: ReadonlySet<string> = new Set([
  'any',
  'string',
  'number',
  'boolean',
  'array',
  'object',
  'null',
  'integer',
])

/**
 * Validate a type *expression* (a declaration's `type` / `returns` value),
 * as opposed to checking a value against one. Registration-time (Phase 2):
 * declared types must be drawn from the vocabulary. Empty unions and empty
 * literal sets are rejected — they admit nothing and mean nothing.
 */
export const isExpectedType = (expression: unknown): expression is ExpectedType => {
  if (typeof expression === 'string') return BASIC_TYPES.has(expression)
  if (Array.isArray(expression))
    return (
      expression.length > 0 && expression.every((t) => typeof t === 'string' && BASIC_TYPES.has(t))
    )
  if (isPlainObject(expression) && 'literal' in expression) {
    const members = (expression as { literal: unknown }).literal
    return (
      Array.isArray(members) &&
      members.length > 0 &&
      members.every((m) => ['string', 'number', 'boolean'].includes(typeof m))
    )
  }
  return false
}

/** Check a single value against a declared type. */
export const checkType = (value: unknown, expected: ExpectedType): TypeCheckResult => {
  if (isLiteralType(expected)) {
    if (expected.literal.indexOf(value as string | number | boolean) !== -1) return OK
    const allowed = expected.literal.map((v) => JSON.stringify(v)).join(', ')
    return fail(`one of ${allowed}`, value)
  }

  if (typeof expected === 'string')
    return matchesBasic(value, expected) ? OK : fail(expected, value)
  return expected.some((t) => matchesBasic(value, t)) ? OK : fail(expected.join(' | '), value)
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
          actual: describeElements(value),
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

/**
 * The `actual` of a failed `homogeneous` check: the elements' one type when
 * they share it (a type the constraint doesn't allow), otherwise the first
 * two that differ.
 */
const describeElements = (elements: unknown[]): string => {
  const first = describeType(elements[0])
  const other = elements.find((element) => describeType(element) !== first)
  return other === undefined ? `array of ${first}` : `${describeType(other)} beside ${first}`
}

const CONSTRAINT_KEYS = ['length', 'homogeneous', 'elementShape']

/**
 * Validate a `constraints` *declaration* (Phase 2 registration), as opposed
 * to checking a value against one. Unknown keys are rejected — a typo'd
 * constraint silently checking nothing is the failure mode this exists to
 * prevent. `elementShape` declarations may carry extra descriptive fields;
 * only the three the checker reads (`type` / `required` / `constraints`) are
 * validated.
 */
export const validateConstraintsShape = (declaration: unknown): TypeCheckResult => {
  if (!isPlainObject(declaration)) return fail('a constraints object', declaration)

  for (const key of Object.keys(declaration)) {
    if (!CONSTRAINT_KEYS.includes(key))
      return { ok: false, expected: `one of ${CONSTRAINT_KEYS.join(', ')}`, actual: key }
  }

  const { length, homogeneous, elementShape } = declaration

  if (length !== undefined && (!Number.isInteger(length) || (length as number) < 0))
    return fail('a non-negative integer length', length)

  if (homogeneous !== undefined && (!Array.isArray(homogeneous) || !isExpectedType(homogeneous)))
    return fail('a non-empty array of basic types', homogeneous)

  if (elementShape !== undefined) {
    if (!isPlainObject(elementShape)) return fail('an object of declarations', elementShape)
    for (const [key, entry] of Object.entries(elementShape)) {
      if (!isPlainObject(entry)) return fail(`a declaration for "${key}"`, entry)
      if (entry.type !== undefined && !isExpectedType(entry.type))
        return fail(`a vocabulary type for "${key}"`, entry.type)
      if (entry.required !== undefined && typeof entry.required !== 'boolean')
        return fail(`a boolean "required" for "${key}"`, entry.required)
      if (entry.constraints !== undefined) {
        const nested = validateConstraintsShape(entry.constraints)
        if (!nested.ok) return nested
      }
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
    const checked = checkDeclared(element[key], declaration)
    if (!checked.ok) return checked
  }

  return OK
}

/**
 * Constraints on a container whose declaration carries an element null
 * policy: null elements belong to that policy, not to the constraints, so
 * `length` still counts every slot (a null occupies its position) while
 * `homogeneous` / `elementShape` see the null-free view. Without an element
 * policy the value is checked as-is. Shared by the static layer (literal
 * containers) and the runtime layer (resolved ones).
 */
export const checkConstraintsUnderPolicy = (
  value: unknown,
  constraints: Constraints,
  elementPolicyDeclared: boolean
): TypeCheckResult => {
  if (!elementPolicyDeclared || !Array.isArray(value)) return checkConstraints(value, constraints)
  const { length, ...elementWise } = constraints
  if (length !== undefined) {
    const arity = checkConstraints(value, { length })
    if (!arity.ok) return arity
  }
  return checkConstraints(
    value.filter((element) => element !== null),
    elementWise
  )
}

/**
 * What a value is checked against where it meets a declaration: a
 * parameter's, a fragment parameter's, or an `elementShape` property's.
 */
interface Declared {
  type?: ExpectedType
  constraints?: Constraints
  elementNullPolicy?: unknown
}

/**
 * A declaration's constraints, applied to a value its type admits. They
 * describe a container's shape, so a null has none to check, and the null
 * elements of a container under a declared element null policy are that
 * policy's business. One rule wherever a value meets a declaration: a
 * default at registration, a literal before evaluation, a value during it.
 */
export const checkDeclaredConstraints = (value: unknown, declared: Declared): TypeCheckResult =>
  value === null || declared.constraints === undefined
    ? OK
    : checkConstraintsUnderPolicy(
        value,
        declared.constraints,
        declared.elementNullPolicy !== undefined
      )

/** The type check, then the constraints: a declaration's two layers. */
export const checkDeclared = (value: unknown, declared: Declared): TypeCheckResult => {
  if (declared.type !== undefined) {
    const typed = checkType(value, declared.type)
    if (!typed.ok) return typed
  }
  return checkDeclaredConstraints(value, declared)
}
