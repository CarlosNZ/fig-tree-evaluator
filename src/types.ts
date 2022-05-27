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
  PassThruNode,
  QueryResult,
} from './operators'

export const Operators = [
  'AND',
  'OR',
  'EQUAL',
  'NOT_EQUAL',
  'PLUS',
  'CONDITIONAL',
  'REGEX',
  'OBJECT_PROPERTIES',
  'STRING_SUBSTITUTION',
  'GET',
  'POST',
  'PG_SQL',
  'GRAPHQL',
  'BUILD_OBJECT',
  'OBJECT_FUNCTIONS',
  'PASSTHRU',
] as const

export type Operator = typeof Operators[number]

export type BasicObject = {
  [key: string]: any
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

export interface EvaluatorConfig {
  options: EvaluatorOptions
  operators: OperatorReference
  operatorAliases: { [key: string]: Operator }
}

export type OutputType = 'string' | 'number' | 'boolean' | 'bool' | 'array'

export interface BaseOperatorNode {
  operator: Operator
  type?: OutputType
  children?: Array<EvaluatorNode>
  fallback?: any
}

export type CombinedOperatorNode = BaseOperatorNode &
  BasicExtendedNode &
  ConditionalNode &
  RegexNode &
  StringSubNode &
  ObjPropNode &
  APINode &
  PGNode &
  GraphQLNode &
  BuildObjectNode &
  ObjFuncNode &
  PassThruNode

export type OperatorNodeUnion =
  | BasicExtendedNode
  | ConditionalNode
  | RegexNode
  | StringSubNode
  | ObjPropNode
  | PGNode
  | GraphQLNode
  | APINode
  | BuildObjectNode
  | ObjFuncNode
  | PassThruNode

export type ValueNode = string | boolean | number | BasicObject | null | undefined | any[]

export type EvaluatorNode = CombinedOperatorNode | ValueNode

export type OperatorObject = {
  requiredProperties: readonly string[]
  operatorAliases: string[]
  propertyAliases: { [key: string]: string }
  evaluate: (expression: CombinedOperatorNode, config: EvaluatorConfig) => Promise<ValueNode>
  parseChildren: (
    expression: CombinedOperatorNode,
    config: EvaluatorConfig
  ) => OperatorNodeUnion | Promise<OperatorNodeUnion>
}

export type OperatorReference = { [key in Operator]: OperatorObject }
