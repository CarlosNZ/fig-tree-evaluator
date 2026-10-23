import { defineOperator } from 'fig-tree-evaluator'

export const formatNumber = defineOperator({
  name: 'formatNumber',
  category: 'string',
  parameters: {
    value: { type: ['number', 'null'] },
    locale: { type: 'string', default: 'en-NZ' },
  },
  positionalParams: ['value', 'locale'],
  returns: 'string',
  evaluate: ({ value, locale }) => new Intl.NumberFormat(locale).format(value),
})
