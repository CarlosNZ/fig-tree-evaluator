export const testExpressions = {
  default: {
    operator: '?',
    condition: { operator: '=', values: [1, { fragment: 'simpleAdder' }] },
    valueIfFalse: { fragment: 'getCapital' },
    fallback: 'Should show up',
    $myAlias: 'Should be at the end',
    notThisOne: 'Nah',
  },
  matchOpWithBaseBranches: {
    operator: 'match',
    matchExpression: 'matchMe',
    matchMe: 'Matching',
    notMe: 'Not matching',
  },
  children: {
    operator: '?',
    children: [true, 'TRUE', 'FALSE'],
  },
  includesShorthand: {
    operator: '?',
    condition: false,
    valueIfTrue: 'The condition is true',
    valueIfFalse: {
      $plus: [5, 6, 7],
    },
  },
}
