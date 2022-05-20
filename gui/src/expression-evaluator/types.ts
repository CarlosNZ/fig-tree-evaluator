export type BasicObject = {
  [key: string]: any
}

interface QueryRowResult {
  [columns: string]: any
}

export interface QueryResult {
  rows: QueryRowResult[]
}
export interface IConnection {
  query: (expression: { text: string; values?: any[]; rowMode?: string }) => Promise<QueryResult>
}

export interface IGraphQLConnection {
  fetch: Function
  endpoint: string
  headers?: { [key: string]: string }
}

export interface IParameters {
  objects?: BasicObject
  pgConnection?: IConnection
  graphQLConnection?: IGraphQLConnection
  APIfetch?: Function
  headers?: { [key: string]: string }
}

export interface OperatorNode {
  operator: Operator
  type?: OutputType
  children?: Array<EvaluatorNode>
  fallback?: any
  value?: ValueNode // deprecated
}

export type ValueNode = string | boolean | number | BasicObject | null | undefined | any[]

export type OutputType = 'string' | 'number' | 'boolean' | 'array'

type Operator =
  | 'AND'
  | 'OR'
  | 'CONCAT'
  | '='
  | '!='
  | '+'
  | '?'
  | 'REGEX'
  | 'objectProperties'
  | 'objectFunctions'
  | 'stringSubstitution'
  | 'GET'
  | 'POST'
  | 'API'
  | 'pgSQL'
  | 'graphQL'

export type EvaluatorNode = OperatorNode | ValueNode

export type EvaluateExpression = (
  inputQuery: EvaluatorNode,
  params?: IParameters
) => Promise<ValueNode>

export type EvaluateExpressionInstance = (inputQuery: EvaluatorNode) => Promise<ValueNode>

export type IsEvaluationExpression = (expressionOrValue: EvaluatorNode) => boolean
