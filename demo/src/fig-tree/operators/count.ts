import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['count', 'length']
const propertyAliases = {}

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<number> => {
  const values = await evaluateArray(expression.values, config)
  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })
  return values.length
}

export const COUNT: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
