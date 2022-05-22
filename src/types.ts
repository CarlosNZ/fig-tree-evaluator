export type Operator =
  | 'AND'
  | 'OR'
  | 'EQUAL'
  | 'NOT_EQUAL'
  | 'PLUS'
  | 'CONDITIONAL'
  | 'REGEX'
  | 'OBJECT_PROPERTIES'
  | 'STRING_SUBSTITUTION'
  | 'GET'
  | 'POST'
  | 'PG_SQL'
  | 'GRAPHQL'
  | 'BUILD_OBJECT'
  | 'OBJECT_FUNCTIONS'

export type BasicObject = {
  [key: string]: any
}

interface QueryRowResult {
  [columns: string]: any
}

export interface QueryResult {
  rows: QueryRowResult[]
}
export interface PGConnection {
  query: (expression: { text: string; values?: any[]; rowMode?: string }) => Promise<QueryResult>
}

export interface GraphQLConnection {
  fetch: Function
  endpoint: string
  headers?: { [key: string]: string }
}

export interface EvaluatorOptions {
  objects?: BasicObject
  pgConnection?: PGConnection
  graphQLConnection?: GraphQLConnection
  APIfetch?: Function
  headers?: { [key: string]: string }
  returnErrorAsString?: boolean
  allowJSONStringInput?: boolean
}

export type OutputType = 'string' | 'number' | 'boolean' | 'bool' | 'array'

export interface OperatorNode {
  operator: Operator
  type?: OutputType
  children?: Array<EvaluatorNode>
  fallback?: any
  [key: string]: any
}

export interface AndNode extends OperatorNode {
  operator: 'AND'
  values?: EvaluatorNode[]
}

export type FullOperatorNode = OperatorNode | AndNode

export type ValueNode = string | boolean | number | BasicObject | null | undefined | any[]

export interface OperatorReference {
  [key: string]: Operator
}

// For objectReference methods
export interface OperationInput {
  children: any[]
  expression?: FullOperatorNode
  options?: EvaluatorOptions
}

export type EvaluatorNode = FullOperatorNode | ValueNode
