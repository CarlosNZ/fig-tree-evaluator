import { compareValues, defineOperator } from 'fig-tree-evaluator'

export const sortBy = defineOperator({
  name: 'sortBy',
  category: 'array',
  parameters: {
    input: { type: 'array' },
    // A name for the element, used in place of $element
    as: { type: 'string', required: false, evaluationMode: 'structural' },
    // Evaluated for each element of input: the value to sort it by
    by: { type: ['number', 'string'], evaluationMode: 'perElement', over: 'input' },
  },
  positionalParams: ['input', 'by'],
  returns: 'array',
  evaluate: async ({ input, by }) => {
    // Every element's sort value, all evaluated at once
    const values = await Promise.all(input.map((_, index) => by.evaluate(index)))
    // Put the positions in order of their values, then the elements in that order
    const order = input.map((_, index) => index)
    order.sort((a, b) => compareValues(values[a], values[b]))
    return order.map((index) => input[index])
  },
})
