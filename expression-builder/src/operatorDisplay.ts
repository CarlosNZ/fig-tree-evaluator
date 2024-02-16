import { type Operator } from 'fig-tree-evaluator'

export interface OperatorDisplay {
  backgroundColor: string
  textColor: string
  displayName: string
}

export const operatorDisplay: Record<Operator, OperatorDisplay> = {
  AND: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Logical AND',
  },
  OR: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Logical OR',
  },
  EQUAL: {
    backgroundColor: '#2294E5',
    textColor: 'black',
    displayName: 'Equal',
  },
  NOT_EQUAL: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Not Equal',
  },
  PLUS: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Plus (+)',
  },
  SUBTRACT: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Minus (-)',
  },
  MULTIPLY: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Multiply (X)',
  },
  DIVIDE: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Divide (/)',
  },
  GREATER_THAN: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Greater than (>)',
  },
  LESS_THAN: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Less than (<)',
  },
  CONDITIONAL: {
    backgroundColor: '#7CE522',
    textColor: 'black',
    displayName: 'Conditional',
  },
  REGEX: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Regular Expression',
  },
  OBJECT_PROPERTIES: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Object Data {...}',
  },
  STRING_SUBSTITUTION: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'String substitution',
  },
  SPLIT: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Split text',
  },
  COUNT: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Count',
  },
  GET: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Http GET request',
  },
  POST: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Http POST request',
  },
  PG_SQL: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'PostgreSQL query',
  },
  GRAPHQL: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'GraphQL query',
  },
  BUILD_OBJECT: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Build object',
  },
  MATCH: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Match',
  },
  CUSTOM_FUNCTIONS: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Custom functions()',
  },
  PASSTHRU: {
    backgroundColor: 'green',
    textColor: 'black',
    displayName: 'Pass thru',
  },
}
