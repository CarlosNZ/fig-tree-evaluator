import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { EvaluatorConfig, OperatorObject } from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['count', 'length']
const propertyAliases = {}

const evaluate = async (
  expression: BasicExtendedNode,
  config: EvaluatorConfig
): Promise<number> => {
  const values = await evaluateArray(expression.values, config)
  if (!Array.isArray(values)) throw new Error('"values" property not an array')
  return values.length
}

export const COUNT: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
