import FigTreeCache from './cache'
import { GraphQLConnection } from './operators'
import { operatorAliases } from './operators/operatorAliases'
import { ExpectedType, TypeCheckInput } from './typeCheck'
import { Client } from 'pg'

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

export type Operator = (typeof Operators)[number]
export type OperatorAlias = keyof typeof operatorAliases
export type OperatorAliases = Record<string, Operator>

export type Fragments = Record<string, Fragment>
export type UnknownFunction = (...args: any[]) => EvaluatorOutput

export interface FigTreeOptions {
  data?: object
  objects?: object // same as "data" -- deprecated
  functions?: Record<string, UnknownFunction>
  fragments?: Fragments
  pgConnection?: Client
  graphQLConnection?: GraphQLConnection
  baseEndpoint?: string
  headers?: { [key: string]: string }
  returnErrorAsString?: boolean
  nullEqualsUndefined?: boolean
  caseInsensitive?: boolean
  allowJSONStringInput?: boolean
  noShorthand?: boolean
  skipRuntimeTypeCheck?: boolean
  evaluateFullObject?: boolean
  excludeOperators?: OperatorAlias[]
  useCache?: boolean
  maxCacheSize?: number
  maxCacheTime?: number // seconds
  // Undocumented -- only for < v1 compatibility
  supportDeprecatedValueNodes?: boolean
}

export interface FigTreeConfig {
  options: FigTreeOptions
  operators: OperatorReference
  operatorAliases: OperatorAliases
  typeChecker: (...args: TypeCheckInput[] | [TypeCheckInput[]]) => void
  resolvedAliasNodes: { [key: string]: EvaluatorOutput }
  cache: FigTreeCache
}

export type OutputType = 'string' | 'number' | 'boolean' | 'bool' | 'array'

export interface OperatorNode {
  operator: OperatorAlias
  outputType?: OutputType
  children?: EvaluatorNode[]
  fallback?: EvaluatorNode
  useCache?: boolean
  // Additional parameters and Alias nodes
  [key: string]: EvaluatorNode
}

export interface FragmentNode {
  fragment: string
  parameters?: Record<string, EvaluatorNode>
  // For parameters at the root level
  [key: string]: EvaluatorNode
}

export interface FragmentData {
  description?: string
  parameters?: Record<string, { type: string | string[]; required: boolean }>
}

export type Fragment =
  | (EvaluatorNode & {
      metadata?: FragmentData
    })
  | null

export type EvaluatorOutput =
  | string
  | boolean
  | number
  | object
  | null
  | undefined
  | Array<EvaluatorOutput>

export type EvaluatorNode = OperatorNode | FragmentNode | EvaluatorOutput

export type OperatorObject = {
  propertyAliases: Record<string, string>
  operatorData: OperatorData
  evaluate: EvaluateMethod
  parseChildren: ParseChildrenMethod
}

export type EvaluateMethod = (
  expression: OperatorNode,
  config: FigTreeConfig
) => Promise<EvaluatorOutput>

export type ParseChildrenMethod = (
  expression: OperatorNode,
  config: FigTreeConfig
) => OperatorNode | Promise<OperatorNode>

export type OperatorReference = { [key in Operator]: OperatorObject }

// Operator Data
export type Parameter = {
  name: string
  description: string
  aliases: string[]
  required: boolean
  suggest?: boolean // Defaults to same as required, can't be `false` if `required` is `true`
  type: ExpectedType
}

export interface OperatorData {
  description: string
  aliases: string[]
  parameters: Parameter[]
}

export type OperatorMetadata = OperatorData & {
  operator: Operator
}

export type FragmentMetadata = FragmentData & { name: string }

export type CustomFunctionMetadata = { name: string; numRequiredArgs: number }
