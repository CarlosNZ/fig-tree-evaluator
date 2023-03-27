import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import {
  EvaluatorNode,
  BaseOperatorNode,
  CombinedOperatorNode,
  FigTreeConfig,
  OperatorObject,
} from '../../types'
import operatorData, { requiredProperties, propertyAliases } from './data'

export type BasicExtendedNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode[]
} & BaseOperatorNode

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<boolean> => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]
  config.typeChecker(...getTypeCheckInput(operatorData.parameters, { values }))
  return values.reduce((acc: boolean, val: boolean) => acc && !!val, true)
}

export const parseChildren = (expression: CombinedOperatorNode): BasicExtendedNode => {
  const values = expression.children as EvaluatorNode[]
  return { ...expression, values } as any
}

export const AND: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
