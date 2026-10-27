import { compareValues, defineOperator } from 'fig-tree-evaluator'

export const sortBy = defineOperator({
  name: 'sortBy',
  category: 'array',
  parameters: {
    input: { type: 'array' },
    // Evaluated for each element of input: the value to sort it by
    by: { type: ['number', 'string'], evaluationMode: 'perElement', over: 'input' },
    // A name for the element, used in place of $element
    as: { type: 'string', required: false, evaluationMode: 'structural' },
  },
  positionalParams: ['input', 'by'],
  returns: 'array',
  evaluate: async ({ input, by }) => {
    // sort() can't await, so work out every element's sort value first
    const values = await Promise.all(input.map((_, index) => by.evaluate(index)))
    // Keep each value with its element as they're sorted
    const pairs = input.map((element, index) => ({ element, value: values[index] }))
    // FigTree's own comparison utility, as used by greaterThan
    // and other core comparison operators
    pairs.sort((a, b) => compareValues(a.value, b.value))
    return pairs.map(({ element }) => element)
  },
})
