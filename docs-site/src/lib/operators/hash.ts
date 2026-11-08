import { defineOperator, EvaluationData } from 'fig-tree-evaluator'

export const hash = defineOperator({
  name: 'hash',
  category: 'other',
  parameters: {
    value: { type: 'any', default: EvaluationData },
  },
  positionalParams: ['value'],
  returns: 'string',
  // A SHA-256 hash of the value, as a hex string
  evaluate: async ({ value }) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value))
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  },
})
