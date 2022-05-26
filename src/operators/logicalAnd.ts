import { evaluateArray } from './_helpers'
import {
  EvaluatorNode,
  BaseOperatorNode,
  CombinedOperatorNode,
  EvaluatorConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['and', '&', '&&']
const propertyAliases = {}

export type BasicExtendedNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode[]
} & BaseOperatorNode

const evaluate = async (
  expression: BasicExtendedNode,
  config: EvaluatorConfig
): Promise<Boolean> => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]
  return values.reduce((acc: boolean, val: boolean) => acc && (val as boolean), true)
}

export const parseChildren = (expression: CombinedOperatorNode): BasicExtendedNode => {
  const values = expression.children as EvaluatorNode[]
  return { ...expression, values }
}

export const AND: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
