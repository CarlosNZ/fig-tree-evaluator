/**
 * Batch 4, the eager value operators
 * (docs-dev/v3-specs/v3-operator-parameters.md): strict strings in,
 * propagate null, one shared whitespace set and one
 * code-point segmentation (src/primitives). The renderers (`buildString`,
 * `join`) and `regex` land in Phase 7.2.
 */
import { defineOperator } from '../defineOperator'
import { toCodePoints, trim as trimText } from '../primitives'

const normalizer = (name: string, description: string, transform: (value: string) => string) =>
  defineOperator({
    name,
    description,
    parameters: { value: { type: ['string', 'null'] } },
    positionalParams: ['value'],
    returns: 'string',
    evaluate: ({ value }) => transform(value),
  })

export const lower = normalizer(
  'lower',
  'Lowercase a string — Unicode default case mapping, locale-independent',
  (value) => value.toLowerCase()
)
export const upper = normalizer(
  'upper',
  'Uppercase a string — Unicode default case mapping, locale-independent',
  (value) => value.toUpperCase()
)
export const trim = normalizer(
  'trim',
  'Strip whitespace (the JS trim set) from both ends of a string',
  trimText
)

export const split = defineOperator({
  name: 'split',
  description:
    'Divide a string on a delimiter into an array of pieces — empty pieces are kept; an empty delimiter splits into code points',
  parameters: {
    value: { type: ['string', 'null'], description: 'The string to divide' },
    delimiter: {
      type: 'string',
      default: ' ',
      description: 'Split on each occurrence; "" splits into code points',
    },
    trim: { type: 'boolean', default: true, description: 'Trim whitespace from each piece' },
  },
  positionalParams: ['value', 'delimiter'],
  returns: 'array',
  evaluate: ({ value, delimiter, trim }) => {
    const pieces = delimiter === '' ? toCodePoints(value) : value.split(delimiter)
    return trim ? pieces.map(trimText) : pieces
  },
})
