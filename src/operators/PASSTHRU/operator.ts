import { evaluatorFunction } from '../../evaluate'
import {
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
  CombinedOperatorNode,
  EvaluatorNode,
  BaseOperatorNode,
} from '../../types'
import operatorData, { propertyAliases } from './data'

export type PassThruNode = {
  value: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (
  expression: PassThruNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  return await evaluatorFunction(expression.value, config)
}

const parseChildren = (expression: CombinedOperatorNode): PassThruNode => {
  const [...children] = expression.children as EvaluatorNode[]
  const value = children?.length === 1 ? children[0] : children
  return { ...expression, value }
}

export const PASSTHRU: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
