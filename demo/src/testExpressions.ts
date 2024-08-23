export const testExpressions = {
  default: {
    operator: '?',
    condition: { operator: '=', values: [1, { fragment: 'simpleAdder' }] },
    valueIfFalse: { fragment: 'getCapital' },
    fallback: 'Should show up',
    $myAlias: 'Should be at the end',
    notThisOne: 'Nah',
  },
  simpleCondition: {
    operator: '?',
    condition: true,
    ifTrue: 'YES',
    valueIfFalse: 'Out',
  },
  defaultUnordered: {
    fallback: 'Should show up',
    condition: { operator: '=', values: [1, { fragment: 'simpleAdder' }] },
    valueIfFalse: { $country: 'New Zealand', fragment: 'getCapital' },
    valueIfTrue: 'NAH',
    operator: '?',
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
  childrenBackwards: {
    children: [
      {
        children: ['responses.manRemove.selection[0]', null],
        operator: 'objectProperties',
      },
      null,
    ],
    operator: '!=',
  },
  validateNested: {
    values: [
      { operator: '?' },
      {
        valueIfFalse: 'OTHER',
        operator: '?',
        valueIfTrue: { operator: '?', valueIfFalse: 'Not MIssing' },
      },
    ],
    operator: '+',
  },
}
