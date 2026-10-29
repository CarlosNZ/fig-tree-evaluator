import { defineOperator, type ListingMap } from 'fig-tree-evaluator'

/**
 * The custom operators the Playground's examples use. The Playground and the
 * demo each register them on an instance of their own.
 */
export const customOperators = [
  defineOperator({
    name: 'reverse',
    category: 'other',
    parameters: { value: { type: ['string', 'array'] } },
    positionalParams: ['value'],
    evaluate: ({ value }) =>
      Array.isArray(value) ? [...value].reverse() : String(value).split('').reverse().join(''),
  }),
  defineOperator({
    name: 'changeCase',
    category: 'string',
    parameters: {
      string: { type: 'string' },
      toCase: { type: { literal: ['upper', 'lower'] } },
    },
    positionalParams: ['string', 'toCase'],
    evaluate: ({ string, toCase }) =>
      toCase === 'upper' ? String(string).toUpperCase() : String(string).toLowerCase(),
  }),
  defineOperator({
    name: 'currentDate',
    category: 'other',
    parameters: {},
    evaluate: () => new Date().toLocaleDateString(),
  }),
]

/**
 * How the editor presents the custom operators: their text, which no
 * operator definition carries
 */
export const operatorListings: ListingMap = {
  reverse: {
    description: 'Reverses a string, or an array',
    parameterDescriptions: { value: 'The string or array' },
  },
  changeCase: {
    description: 'Converts a string to upper or lower case',
    parameterDescriptions: { string: 'The string to convert', toCase: 'The case to convert to' },
  },
  currentDate: { description: "Returns today's date in the local format" },
}
