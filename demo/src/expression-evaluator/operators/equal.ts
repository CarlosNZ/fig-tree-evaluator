import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { EvaluatorConfig, OperatorObject } from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['=', 'eq', 'equal', 'equals']
const propertyAliases = {}

const evaluate = async (
  expression: BasicExtendedNode,
  options: EvaluatorConfig
): Promise<Boolean> => {
  const values = (await evaluateArray(expression.values, options)) as boolean[]
  return values.every((value) => value == values[0])
}

export const EQUAL: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
