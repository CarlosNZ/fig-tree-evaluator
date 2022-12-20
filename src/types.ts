import {
  BasicExtendedNode,
  SubtractionNode,
  DivisionNode,
  ComparatorNode,
  ConditionalNode,
  RegexNode,
  StringSubNode,
  SplitNode,
  ObjPropNode,
  APINode,
  PGNode,
  GraphQLNode,
  BuildObjectNode,
  MatchNode,
  FunctionNode,
  PassThruNode,
  PGConnection,
  GraphQLConnection,
} from './operators'
import { TypeCheckInput } from './typeCheck'

export const Operators = [
  // Canonical operator names
  'AND',
  'OR',
  'EQUAL',
  'NOT_EQUAL',
  'PLUS',
  'SUBTRACT',
  'MULTIPLY',
  'DIVIDE',
  'GREATER_THAN',
  'LESS_THAN',
  'CONDITIONAL',
  'REGEX',
  'OBJECT_PROPERTIES',
  'STRING_SUBSTITUTION',
  'SPLIT',
  'COUNT',
  'GET',
  'POST',
  'PG_SQL',
  'GRAPHQL',
  'BUILD_OBJECT',
  'MATCH',
  'CUSTOM_FUNCTIONS',
  'PASSTHRU',
] as const

export type Operator = typeof Operators[number]

export type GenericObject = {
  [key: string]: any
}

export interface FigTreeOptions {
  objects?: GenericObject
  functions?: { [key: string]: Function }
  pgConnection?: PGConnection
  graphQLConnection?: GraphQLConnection
  baseEndpoint?: string
  headers?: { [key: string]: string }
  returnErrorAsString?: boolean
  nullEqualsUndefined?: boolean
  allowJSONStringInput?: boolean
  skipRuntimeTypeCheck?: boolean
}

export interface FigTreeConfig {
  options: FigTreeOptions
  operators: OperatorReference
  operatorAliases: { [key: string]: Operator }
  typeChecker: (...input: TypeCheckInput[]) => void
  resolvedAliasNodes: { [key: string]: EvaluatorOutput }
}

export type OutputType = 'string' | 'number' | 'boolean' | 'bool' | 'array'

export interface BaseOperatorNode {
  operator: Operator
  outputType?: OutputType
  children?: Array<EvaluatorNode>
  fallback?: any
  // For NodeAliases
  [key: string]: EvaluatorNode
}

export type CombinedOperatorNode = BaseOperatorNode &
  BasicExtendedNode &
  SubtractionNode &
  DivisionNode &
  ComparatorNode &
  ConditionalNode &
  RegexNode &
  StringSubNode &
  SplitNode &
  ObjPropNode &
  APINode &
  PGNode &
  GraphQLNode &
  BuildObjectNode &
  MatchNode &
  FunctionNode &
  PassThruNode

export type OperatorNodeUnion =
  | BasicExtendedNode
  | SubtractionNode
  | DivisionNode
  | ComparatorNode
  | ConditionalNode
  | RegexNode
  | StringSubNode
  | SplitNode
  | ObjPropNode
  | PGNode
  | GraphQLNode
  | APINode
  | BuildObjectNode
  | MatchNode
  | FunctionNode
  | PassThruNode

export type EvaluatorOutput = string | boolean | number | GenericObject | null | undefined | any[]

export type EvaluatorNode = CombinedOperatorNode | EvaluatorOutput

export type OperatorObject = {
  requiredProperties: readonly string[]
  operatorAliases: string[]
  propertyAliases: { [key: string]: string }
  evaluate: (expression: CombinedOperatorNode, config: FigTreeConfig) => Promise<EvaluatorOutput>
  parseChildren: (
    expression: CombinedOperatorNode,
    config: FigTreeConfig
  ) => OperatorNodeUnion | Promise<OperatorNodeUnion>
}

export type OperatorReference = { [key in Operator]: OperatorObject }
