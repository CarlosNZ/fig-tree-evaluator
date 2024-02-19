import FigTreeEvaluator, { evaluateExpression } from './FigTreeEvaluator'
import {
  Operator,
  OperatorAlias,
  FigTreeOptions,
  FigTreeConfig,
  EvaluatorNode,
  OperatorNode,
  FragmentNode,
  EvaluatorOutput,
  OutputType,
  OperatorData,
  OperatorMetadata,
  FragmentMetadata,
  CustomFunctionMetadata,
  OperatorParameterMetadata,
} from './types'
import { GraphQLConnection } from './operators'
import { BasicType, LiteralType, ExpectedType } from './typeCheck'
import {
  isAliasString,
  isFragmentNode,
  isOperatorNode,
  isObject,
  standardiseOperatorName,
  truncateString,
} from './helpers'

export {
  // Core
  evaluateExpression,
  FigTreeEvaluator,
  // Additional helpers, utilities
  isAliasString,
  isFragmentNode,
  isOperatorNode,
  isObject,
  standardiseOperatorName,
  truncateString,
  // Types
  type Operator,
  type OperatorAlias,
  type FigTreeOptions,
  type FigTreeConfig,
  type EvaluatorNode,
  type OperatorNode,
  type FragmentNode,
  type EvaluatorOutput,
  type OutputType,
  type OperatorData,
  type OperatorMetadata,
  type FragmentMetadata,
  type CustomFunctionMetadata,
  type OperatorParameterMetadata,
  type GraphQLConnection,
  type BasicType,
  type LiteralType,
  type ExpectedType,
}
