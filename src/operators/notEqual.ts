import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { EvaluatorConfig, OperatorObject } from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['!=', '!', 'ne', 'notEqual']
const propertyAliases = {}

const evaluate = async (
  expression: BasicExtendedNode,
  config: EvaluatorConfig
): Promise<Boolean> => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]
  return values[0] != values[1]
}

export const NOT_EQUAL: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
