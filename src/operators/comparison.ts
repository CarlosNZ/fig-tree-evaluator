/**
 * Batch 2 — comparison (docs-dev/v3-specs/v3-operator-parameters.md). All
 * six take their operands as `values` and return actual booleans (the
 * ordering four may propagate null). Equality is total and structural
 * (`deepEqual`); ordering is one shared relation over homogeneous
 * number|string pairs, parameterized by direction and inclusivity.
 */
import { defineOperator } from '../defineOperator'
import { compareValues, deepEqual } from '../primitives'
import { fewerThanTwoWarning } from './shared'

/** Every element deep-equals the first; strings folded when asked. */
const allEqual = (values: unknown[], caseInsensitive: boolean): boolean => {
  const fold = (value: unknown) =>
    caseInsensitive && typeof value === 'string' ? value.toLowerCase() : value
  if (values.length < 2) return true
  const first = fold(values[0])
  return values.every((value) => deepEqual(fold(value), first))
}

const equalityParameters = {
  values: {
    type: 'array',
    elementNullPolicy: 'value',
    description: 'The values compared; null is comparable (null equals null)',
  },
  caseInsensitive: {
    type: 'boolean',
    default: false,
    description: 'Fold string operands to one case before comparing (shallow)',
  },
} as const

export const equal = defineOperator({
  name: 'equal',
  alias: '=',
  description:
    'Are all the values equal? Deep, structural, key-order-insensitive; a cross-type comparison is false',
  parameters: equalityParameters,
  positionalParams: ['...values'],
  returns: 'boolean',
  validate: fewerThanTwoWarning,
  evaluate: ({ values, caseInsensitive }) => allEqual(values, caseInsensitive),
})

export const notEqual = defineOperator({
  name: 'notEqual',
  alias: '!=',
  description: 'Are the values NOT all equal? The exact negation of equal (never "all distinct")',
  parameters: equalityParameters,
  positionalParams: ['...values'],
  returns: 'boolean',
  validate: fewerThanTwoWarning,
  evaluate: ({ values, caseInsensitive }) => !allEqual(values, caseInsensitive),
})

const ordering = (
  name: string,
  alias: string,
  description: string,
  holds: (comparison: number) => boolean
) =>
  defineOperator({
    name,
    alias,
    description,
    parameters: {
      values: {
        type: 'array',
        elementNullPolicy: 'propagate',
        constraints: { length: 2, homogeneous: ['number', 'string'] },
        description: 'Exactly two operands: both numbers, or both strings (codepoint order)',
      },
      nullValueDefault: {
        type: ['number', 'string'],
        required: false,
        evaluation: 'lazy',
        replacesNullAt: ['values'],
        description: 'Replaces a null operand before comparing',
      },
    },
    positionalParams: ['...values'],
    returns: 'boolean',
    evaluate: ({ values }) => {
      const [a, b] = values as [number | string, number | string]
      return holds(compareValues(a, b))
    },
  })

export const greaterThan = ordering(
  'greaterThan',
  '>',
  'Is the first value strictly greater than the second?',
  (comparison) => comparison > 0
)
export const greaterThanOrEqual = ordering(
  'greaterThanOrEqual',
  '>=',
  'Is the first value greater than or equal to the second?',
  (comparison) => comparison >= 0
)
export const lessThan = ordering(
  'lessThan',
  '<',
  'Is the first value strictly less than the second?',
  (comparison) => comparison < 0
)
export const lessThanOrEqual = ordering(
  'lessThanOrEqual',
  '<=',
  'Is the first value less than or equal to the second?',
  (comparison) => comparison <= 0
)
