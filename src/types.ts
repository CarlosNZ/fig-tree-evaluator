import { AxiosStatic } from 'axios'
import FigTreeCache from './cache'
import { GraphQLConnection, SQLConnection } from './operators'
import { operatorAliases } from './operators/operatorAliases'
import { HttpClient } from './operators/operatorUtils'
import { ExpectedType, TypeCheckInput } from './typeCheck'
import { Fetch } from './httpClients'

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
  'SQL',
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
  data?: Record<string, unknown>
  objects?: Record<string, unknown> // same as "data" -- deprecated
  functions?: Record<string, UnknownFunction | FunctionDefinition>
  fragments?: Fragments
  httpClient?: HttpClient
  graphQLConnection?: GraphQLConnection
  sqlConnection?: SQLConnection
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
  // Undocumented -- only for v1.x compatibility
  supportDeprecatedValueNodes?: boolean
}

export interface FigTreeConfig {
  options: FigTreeOptions
  operators: OperatorReference
  operatorAliases: OperatorAliases
  typeChecker: (...args: TypeCheckInput[] | [TypeCheckInput[]]) => void
  resolvedAliasNodes: { [key: string]: EvaluatorOutput }
  cache: FigTreeCache
  httpClient?: HttpClient
  graphQLClient?: HttpClient
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
  parameters?: FragmentParameterMetadata[]
  textColor?: string
  backgroundColor?: string
}

export interface FunctionDefinition {
  function: UnknownFunction
  description?: string
  argsDefault?: unknown[]
  inputDefault?: Record<string, unknown>
  textColor?: string
  backgroundColor?: string
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

// Operator Parameter Data
export interface OperatorParameterMetadata {
  name: string
  description: string
  aliases: string[]
  required: boolean
  type: ExpectedType
  default?: unknown
}

export interface FragmentParameterMetadata {
  name: string
  type: string | string[]
  required: boolean
  description?: string
  default?: unknown
}

export interface OperatorData {
  description: string
  aliases: string[]
  parameters: OperatorParameterMetadata[]
}

export type OperatorMetadata = OperatorData & {
  name: Operator
}

export type FragmentMetadata = FragmentData & {
  name: string
}

export type CustomFunctionMetadata = {
  name: string
  numRequiredArgs: number
} & Omit<FunctionDefinition, 'function'>
