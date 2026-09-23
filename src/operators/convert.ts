/**
 * Batch 7 — `convert` ("convert semantics" in docs-dev/v3-specs/v3-api.md;
 * the pass in docs-dev/v3-specs/v3-operator-parameters-2.md). The one
 * explicit cast in v3, and the conditional null policy's proof: null
 * propagates for number/string/array and is consumed (→ false) for
 * boolean, declared, never hand-rolled in the body.
 */
import { declareOperator } from '../buildOperator'
import { isTruthy, renderText } from '../primitives'
import { describeType } from '../typeCheck'
import { isPlainObject } from '../utils'
import { OperatorFailure } from '../OperatorFailure'

const cannot = (value: unknown, to: string) =>
  new OperatorFailure(`cannot convert ${describeType(value)} to ${to}`)

export const convert = declareOperator({
  name: 'convert',
  category: 'other',
  description:
    'Convert a value to a number, string, boolean or array — strict: a failed conversion is an error, never a guess',
  parameters: {
    value: {
      type: 'any',
      nullPolicy: (to) => (to === 'boolean' ? 'value' : 'propagate'),
      description: 'The value to convert; null propagates except for boolean, where it is false',
    },
    to: {
      type: { literal: ['number', 'string', 'boolean', 'array'] },
      description: 'The target type',
    },
  },
  positionalParams: ['value', 'to'],
  returns: ['number', 'string', 'boolean', 'array'],
  evaluate: ({ value, to }) => {
    switch (to) {
      case 'number': {
        if (typeof value === 'number') return value
        if (typeof value === 'boolean') return value ? 1 : 0
        if (typeof value === 'string') {
          const trimmed = value.trim()
          const parsed = trimmed === '' ? NaN : Number(trimmed)
          if (Number.isNaN(parsed))
            throw new OperatorFailure(
              `'${value}' is not a numeric string — use regex to extract a number from text`
            )
          return parsed
        }
        throw cannot(value, 'number')
      }
      case 'string': {
        if (Array.isArray(value) || isPlainObject(value))
          throw new OperatorFailure(
            `cannot convert ${describeType(value)} to string — a cast is not a render; use buildString or join`
          )
        if (typeof value === 'object') throw cannot(value, 'string')
        return renderText(value)
      }
      case 'boolean': {
        if (typeof value === 'string') {
          const folded = value.trim().toLowerCase()
          if (folded === 'true') return true
          if (folded === 'false') return false
        }
        return isTruthy(value)
      }
      case 'array':
        return Array.isArray(value) ? value : [value]
    }
  },
})
