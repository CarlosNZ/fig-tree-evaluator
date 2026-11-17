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
import { OperatorFailure } from '../OperatorFailure'
import { nonFiniteFailure } from './shared'

const cannot = (value: unknown, to: string) =>
  new OperatorFailure(`cannot convert ${describeType(value)} to ${to}`)

export const convert = declareOperator({
  name: 'convert',
  category: 'other',
  parameters: {
    value: {
      type: 'any',
      nullPolicy: (to) => (to === 'boolean' ? 'accept' : 'propagate'),
    },
    to: {
      type: { literal: ['number', 'string', 'boolean', 'array'] },
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
              `'${value}' is not a number — use regex to extract one from text`
            )
          // '1e400' overflows, and 'Infinity' is the same number spelled out
          if (!Number.isFinite(parsed))
            throw nonFiniteFailure(
              /infinity/i.test(trimmed)
                ? `'${value}' is not a finite number`
                : `'${value}' is too large for a number`
            )
          return parsed
        }
        // A BigInt from host data (an int8 column, say) converts only where
        // a number holds it exactly: past ±(2^53 − 1) it would silently lose
        // its last digits
        if (typeof value === 'bigint') {
          const converted = Number(value)
          if (Number.isSafeInteger(converted)) return converted
          throw new OperatorFailure(`the BigInt ${value} is outside the range for normal numbers`)
        }
        throw cannot(value, 'number')
      }
      case 'string': {
        const type = typeof value
        if (type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint')
          return renderText(value)
        throw cannot(value, 'string')
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
