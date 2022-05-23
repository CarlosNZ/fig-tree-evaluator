import {
  BasicExtendedNode,
  ConditionalNode,
  RegexNode,
  StringSubNode,
  ObjPropNode,
  APINode,
  PGNode,
  GraphQLNode,
  BuildObjectNode,
  ObjFuncNode,
} from './operators'

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

export interface BaseOperatorNode {
  operator: Operator
  type?: OutputType
  children?: Array<EvaluatorNode>
  fallback?: any
  [key: string]: any
}

export type OperatorNode =
  | BaseOperatorNode
  | BasicExtendedNode
  | ConditionalNode
  | RegexNode
  | StringSubNode
  | ObjPropNode
  | APINode
  | PGNode
  | GraphQLNode
  | BuildObjectNode
  | ObjFuncNode

export type ValueNode = string | boolean | number | BasicObject | null | undefined | any[]

export type EvaluatorNode = OperatorNode | ValueNode
