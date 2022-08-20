import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { EvaluatorConfig, OperatorObject } from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['!=', '!', 'ne', 'notEqual']
const propertyAliases = {}

const evaluate = async (
  expression: BasicExtendedNode,
  config: EvaluatorConfig
): Promise<boolean> => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]
  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })
  return values.some((val) => val !== values[0])
}

export const NOT_EQUAL: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
