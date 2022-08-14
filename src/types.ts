import {
  BasicExtendedNode,
  SubtractionNode,
  ConditionalNode,
  RegexNode,
  StringSubNode,
  ObjPropNode,
  APINode,
  PGNode,
  GraphQLNode,
  BuildObjectNode,
  FunctionNode,
  PassThruNode,
  PGConnection,
  GraphQLConnection,
} from './operators'

export const Operators = [
  // Canonical operator names
  'AND',
  'OR',
  'EQUAL',
  'NOT_EQUAL',
  'PLUS',
  'SUBTRACT',
  'MULTIPLY',
  'CONDITIONAL',
  'REGEX',
  'OBJECT_PROPERTIES',
  'STRING_SUBSTITUTION',
  'GET',
  'POST',
  'PG_SQL',
  'GRAPHQL',
  'BUILD_OBJECT',
  'CUSTOM_FUNCTIONS',
  'PASSTHRU',
] as const

export type Operator = typeof Operators[number]

export type GenericObject = {
  [key: string]: any
}

export interface EvaluatorOptions {
  objects?: GenericObject
  functions?: { [key: string]: Function }
  pgConnection?: PGConnection
  graphQLConnection?: GraphQLConnection
  baseEndpoint?: string
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
  outputType?: OutputType
  children?: Array<EvaluatorNode>
  fallback?: any
}

export type CombinedOperatorNode = BaseOperatorNode &
  BasicExtendedNode &
  SubtractionNode &
  ConditionalNode &
  RegexNode &
  StringSubNode &
  ObjPropNode &
  APINode &
  PGNode &
  GraphQLNode &
  BuildObjectNode &
  FunctionNode &
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
  | FunctionNode
  | PassThruNode

export type EvaluatorOutput = string | boolean | number | GenericObject | null | undefined | any[]

export type EvaluatorNode = CombinedOperatorNode | EvaluatorOutput

export type OperatorObject = {
  requiredProperties: readonly string[]
  operatorAliases: string[]
  propertyAliases: { [key: string]: string }
  evaluate: (expression: CombinedOperatorNode, config: EvaluatorConfig) => Promise<EvaluatorOutput>
  parseChildren: (
    expression: CombinedOperatorNode,
    config: EvaluatorConfig
  ) => OperatorNodeUnion | Promise<OperatorNodeUnion>
}

export type OperatorReference = { [key in Operator]: OperatorObject }
