import { defineOperator, OperatorFailure } from 'fig-tree-evaluator'

export const median = defineOperator({
  name: 'median',
  category: 'math',
  parameters: {
    values: { type: 'array', constraints: { homogeneous: ['number'] } },
  },
  positionalParams: ['...values'],
  returns: 'number',
  analysis: {
    // The one way evaluate fails: an empty list
    failures: [
      { code: 'operator-failure', parameter: 'values', when: { values: { empty: true } } },
    ],
  },
  evaluate: ({ values }) => {
    if (values.length === 0) throw new OperatorFailure('no values to take the median of')
    const sorted = [...(values as number[])].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  },
})
