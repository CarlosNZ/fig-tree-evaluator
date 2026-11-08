import { defineOperator, OperatorFailure } from 'fig-tree-evaluator'
import { declareAnalysis } from 'fig-tree-evaluator/authoring'

export const daysInMonth = defineOperator({
  name: 'daysInMonth',
  category: 'other',
  parameters: {
    year: { type: 'integer' },
    // 1 for January
    month: { type: 'integer' },
  },
  positionalParams: ['year', 'month'],
  returns: 'integer',
  evaluate: ({ year, month }) => {
    if (month < 1 || month > 12) throw new OperatorFailure(`${month} is not a month`)
    // Day 0 of the next month is the last day of this one
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
  },
})

export const daysInMonthAnalysis = declareAnalysis(daysInMonth, {
  // Every month has 28 to 31 days, whatever the year
  gamut: (params, helpers) => helpers.range({ min: 28, max: 31, integer: true }),
  failures: ({ month }, helpers) => [
    {
      code: 'operator-failure',
      parameter: 'month',
      // Below 1, or not below 13
      occurs: helpers.any(helpers.isBelow(month, 1), helpers.not(helpers.isBelow(month, 13))),
      message: "'month' is not 1 to 12",
    },
  ],
})
