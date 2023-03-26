import { evaluatorFunction } from '../evaluate'
import {
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
  CombinedOperatorNode,
  EvaluatorNode,
  BaseOperatorNode,
} from '../types'

const requiredProperties = ['value'] as const
const operatorAliases = ['_', 'passThru', 'passthru', 'pass', 'ignore', 'coerce', 'convert']
const propertyAliases = { _: 'value', data: 'value' }

export type PassThruNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode[]
} & BaseOperatorNode

const evaluate = async (
  expression: PassThruNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  return await evaluatorFunction(expression.value, config)
}

const parseChildren = (expression: CombinedOperatorNode): PassThruNode => {
  const [...children] = expression.children as EvaluatorNode[]
  return { ...expression, value: children }
}

export const PASSTHRU: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
