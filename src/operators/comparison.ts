/**
 * Batch 2 — comparison (docs-dev/v3-specs/v3-operator-parameters.md). All
 * six take their operands as `values` and return actual booleans (the
 * ordering four may propagate null). Equality is total and structural
 * (`deepEqual`); ordering is one shared relation over homogeneous
 * number|string pairs, parameterized by direction and inclusivity.
 */
import { declareOperator } from '../buildOperator'
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
  },
  caseInsensitive: {
    type: 'boolean',
    default: false,
  },
} as const

export const equal = declareOperator({
  name: 'equal',
  alias: '=',
  category: 'comparison',
  parameters: equalityParameters,
  positionalParams: ['...values'],
  returns: 'boolean',
  validate: fewerThanTwoWarning,
  evaluate: ({ values, caseInsensitive }) => allEqual(values, caseInsensitive),
})

export const notEqual = declareOperator({
  name: 'notEqual',
  alias: '!=',
  category: 'comparison',
  parameters: equalityParameters,
  positionalParams: ['...values'],
  returns: 'boolean',
  validate: fewerThanTwoWarning,
  evaluate: ({ values, caseInsensitive }) => !allEqual(values, caseInsensitive),
})

const ordering = (name: string, alias: string, holds: (comparison: number) => boolean) =>
  declareOperator({
    name,
    alias,
    category: 'comparison',
    parameters: {
      values: {
        type: 'array',
        elementNullPolicy: 'propagate',
        constraints: { length: 2, homogeneous: ['number', 'string'] },
      },
      nullValueDefault: {
        type: ['number', 'string'],
        required: false,
        evaluation: 'lazy',
        replacesNullAt: ['values'],
      },
    },
    positionalParams: ['...values'],
    returns: 'boolean',
    evaluate: ({ values }) => {
      const [a, b] = values as [number | string, number | string]
      return holds(compareValues(a, b))
    },
  })

export const greaterThan = ordering('greaterThan', '>', (comparison) => comparison > 0)
export const greaterThanOrEqual = ordering(
  'greaterThanOrEqual',
  '>=',
  (comparison) => comparison >= 0
)
export const lessThan = ordering('lessThan', '<', (comparison) => comparison < 0)
export const lessThanOrEqual = ordering('lessThanOrEqual', '<=', (comparison) => comparison <= 0)
