import { evaluateArray } from './_helpers'
import { EvaluatorNode, BaseOperatorNode, OperatorNode, ExtendedOptions } from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['and', '&', '&&']
const propertyAliases = {}

export type BasicExtendedNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode[]
} & BaseOperatorNode

const evaluate = async (
  expression: BasicExtendedNode,
  options: ExtendedOptions
): Promise<Boolean> => {
  const values = (await evaluateArray(expression.values, options)) as boolean[]
  return values.reduce((acc: boolean, val: boolean) => acc && (val as boolean), true)
}

export const parseChildren = (expression: OperatorNode): BasicExtendedNode => {
  const values = expression.children as EvaluatorNode[]
  return { ...expression, values }
}

export const AND = { requiredProperties, operatorAliases, propertyAliases, evaluate, parseChildren }
