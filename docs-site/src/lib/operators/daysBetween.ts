import { defineOperator, OperatorFailure } from 'fig-tree-evaluator'

const DAY = 24 * 60 * 60 * 1000

const toTime = (date: string) => {
  const time = Date.parse(date)
  if (Number.isNaN(time)) throw new OperatorFailure(`'${date}' is not a date`)
  return time
}

export const daysBetween = defineOperator({
  name: 'daysBetween',
  category: 'other',
  parameters: {
    from: { type: 'string' },
    to: { type: 'string' },
  },
  positionalParams: ['from', 'to'],
  returns: 'integer',
  analysis: {
    // Either string may not be a date
    failures: [{ code: 'operator-failure', may: true }],
  },
  evaluate: ({ from, to }) => Math.round((toTime(to) - toTime(from)) / DAY),
})
