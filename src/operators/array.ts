/**
 * Batch 5, the eager part (docs-dev/v3-specs/v3-operator-parameters-2.md):
 * `length` — one measure, two carriers. The iterators land in Phase 6.
 */
import { defineOperator } from '../defineOperator'
import { toCodePoints } from '../primitives'

export const length = defineOperator({
  name: 'length',
  description: "An array's element count, or a string's Unicode code-point count",
  parameters: {
    value: {
      type: ['string', 'array', 'null'],
      description: 'The array or string measured',
    },
  },
  positionalParams: ['...value'],
  returns: 'integer',
  evaluate: ({ value }) => (typeof value === 'string' ? toCodePoints(value).length : value.length),
})
