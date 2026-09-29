/**
 * What a compiled node is known to return before anything runs: the type
 * a fragment reports as its `returns`, read from its body's root, and the
 * type the feeding-position check tests against a receiving parameter
 * ("returns" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * As strict as the operator check, and no stricter: an operator's
 * `returns` is taken as declared, never narrowed by its arguments, and
 * neither a `fallback` nor null propagation widens it.
 */
import type { ExpectedType } from '../typeCheck'
import { isPlainObject } from '../utils'
import type { CompiledNode } from './artifact'

export const staticType = (node: CompiledNode): ExpectedType => {
  switch (node.kind) {
    case 'operator':
      return node.entry.definition.returns
    // A call to an unknown fragment has no type to report; its own error
    // says so
    case 'fragmentCall':
      return node.entry?.returns ?? 'any'
    case 'skeleton':
      return Array.isArray(node.skeleton) ? 'array' : 'object'
    case 'constant':
      return valueType(node.value)
    default:
      return 'any'
  }
}

/**
 * A constant's own type, as the type table reads it: a number is `number`,
 * never `integer`, since the two always intersect, and any non-array object
 * is `object`, a `Date` included, as `checkType` admits it. A value with no
 * basic type (a function) is `any`.
 */
const valueType = (value: unknown): ExpectedType => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (isPlainObject(value)) return 'object'
  switch (typeof value) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return 'any'
  }
}
