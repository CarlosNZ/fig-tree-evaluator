import { type Operator } from 'fig-tree-evaluator'

export interface OperatorDisplay {
  backgroundColor: string
  textColor: string
  displayName: string
}

export const operatorDisplay: Record<Operator, OperatorDisplay> & { FRAGMENT: OperatorDisplay } & {
  OUTER: OperatorDisplay
} = {
  AND: {
    backgroundColor: '#91dfd6',
    textColor: '#605f5f',
    displayName: 'Logical AND',
  },
  OR: {
    backgroundColor: '#eddd79',
    textColor: '#4d4b4b',
    displayName: 'Logical OR',
  },
  EQUAL: {
    backgroundColor: '#b7e2c2',
    textColor: '#605f5f',
    displayName: 'Equal',
  },
  NOT_EQUAL: {
    backgroundColor: '#efb8b6',
    textColor: '#3e3e3e',
    displayName: 'Not Equal',
  },
  PLUS: {
    backgroundColor: '#3e7637',
    textColor: '#ffffff',
    displayName: 'Plus (+)',
  },
  SUBTRACT: {
    backgroundColor: '#c0362e',
    textColor: '#ffffff',
    displayName: 'Minus (-)',
  },
  MULTIPLY: {
    backgroundColor: '#3058d1',
    textColor: '#ffffff',
    displayName: 'Multiply (X)',
  },
  DIVIDE: {
    backgroundColor: '#ed9847',
    textColor: '#ffffff',
    displayName: 'Divide (/)',
  },
  GREATER_THAN: {
    backgroundColor: '#59adf5',
    textColor: '#646464',
    displayName: 'Greater than (>)',
  },
  LESS_THAN: {
    backgroundColor: '#f6dd56',
    textColor: '#646464',
    displayName: 'Less than (<)',
  },
  CONDITIONAL: {
    backgroundColor: '#37376d',
    textColor: '#ffffff',
    displayName: 'Conditional',
  },
  REGEX: {
    backgroundColor: '#d756ce',
    textColor: '#e7edb1',
    displayName: 'Regular Expression',
  },
  OBJECT_PROPERTIES: {
    backgroundColor: '#a9b8d0',
    textColor: '#ae2f28',
    displayName: 'Object Data {...}',
  },
  STRING_SUBSTITUTION: {
    backgroundColor: '#a03a2f',
    textColor: '#d7f4f5',
    displayName: 'String substitution',
  },
  SPLIT: {
    backgroundColor: '#e9b884',
    textColor: '#5c3c1d',
    displayName: 'Split text',
  },
  COUNT: {
    backgroundColor: '#325875',
    textColor: '#e3e99b',
    displayName: 'Count',
  },
  GET: {
    backgroundColor: '#c08fe3',
    textColor: '#403f65',
    displayName: 'Http GET request',
  },
  POST: {
    backgroundColor: '#7daf7e',
    textColor: '#403f65',
    displayName: 'Http POST request',
  },
  SQL: {
    backgroundColor: '#48648a',
    textColor: '#f8f8f8',
    displayName: 'SQL query',
  },
  GRAPHQL: {
    backgroundColor: '#b9d9d9',
    textColor: '#cf4295',
    displayName: 'GraphQL query',
  },
  BUILD_OBJECT: {
    backgroundColor: '#bb4f60',
    textColor: '#f2e661',
    displayName: 'Build object',
  },
  MATCH: {
    backgroundColor: '#2e5358',
    textColor: '#efd8b6',
    displayName: 'Match',
  },
  CUSTOM_FUNCTIONS: {
    backgroundColor: '#e8da66',
    textColor: 'black',
    displayName: 'Custom functions()',
  },
  PASSTHRU: {
    backgroundColor: '#bebebe',
    textColor: '#5a5a5a',
    displayName: 'Pass thru',
  },
  FRAGMENT: {
    backgroundColor: '#477799',
    textColor: '#ebdf5a',
    displayName: 'Fragment',
  },
  OUTER: {
    backgroundColor: '#454545',
    textColor: 'white',
    displayName: '',
  },
}
