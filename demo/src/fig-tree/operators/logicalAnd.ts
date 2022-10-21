import { evaluateArray } from './_operatorUtils'
import {
  EvaluatorNode,
  BaseOperatorNode,
  CombinedOperatorNode,
  FigTreeConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['and', '&', '&&']
const propertyAliases = {}

export type BasicExtendedNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode[]
} & BaseOperatorNode

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<boolean> => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]
  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })
  return values.reduce((acc: boolean, val: boolean) => acc && !!val, true)
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
