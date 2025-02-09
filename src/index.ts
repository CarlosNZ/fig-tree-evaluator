import { FigTreeEvaluator, evaluateExpression } from './FigTreeEvaluator'
import { FigTreeError, isFigTreeError } from './FigTreeError'
import { SQLNodePostgres, SQLite } from './databaseConnections'
import { AxiosClient, FetchClient } from './httpClients'
import {
  Operator,
  OperatorAlias,
  FigTreeOptions,
  FigTreeConfig,
  EvaluatorNode,
  OperatorNode,
  FragmentNode,
  Fragment,
  EvaluatorOutput,
  OutputType,
  OperatorData,
  OperatorMetadata,
  FragmentMetadata,
  CustomFunctionMetadata,
  OperatorParameterMetadata,
  FragmentParameterMetadata,
} from './types'
import { GraphQLConnection } from './operators'
import { preProcessShorthand } from './shorthandSyntax'
import { BasicType, LiteralType, ExpectedType } from './typeCheck'
import {
  isAliasString,
  isFragmentNode,
  isOperatorNode,
  isObject,
  standardiseOperatorName,
  truncateString,
  isFigTreeExpression,
} from './helpers'

// Conversion functions not used in package, used in editor utility
import { convertV1ToV2, convertToShorthand, convertFromShorthand } from './convert'

export {
  // Core
  evaluateExpression,
  FigTreeEvaluator,
  // External client abstractions
  SQLNodePostgres,
  SQLite,
  AxiosClient,
  FetchClient,
  // Additional helpers, utilities
  FigTreeError,
  isFigTreeError,
  isAliasString,
  isFragmentNode,
  isOperatorNode,
  isObject,
  preProcessShorthand,
  standardiseOperatorName,
  truncateString,
  isFigTreeExpression,
  // For external utilities, such as expression editor
  convertV1ToV2,
  convertToShorthand,
  convertFromShorthand,
  // Types
  type Operator,
  type OperatorAlias,
  type FigTreeOptions,
  type FigTreeConfig,
  type EvaluatorNode,
  type OperatorNode,
  type FragmentNode,
  type Fragment,
  type EvaluatorOutput,
  type OutputType,
  type OperatorData,
  type OperatorMetadata,
  type FragmentMetadata,
  type CustomFunctionMetadata,
  type OperatorParameterMetadata,
  type FragmentParameterMetadata,
  type GraphQLConnection,
  type BasicType,
  type LiteralType,
  type ExpectedType,
}
