import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['*', 'x', 'multiply', 'times']
const propertyAliases = {}

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<number> => {
  const values = (await evaluateArray(expression.values, config)) as number[]
  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })
  return values.reduce((acc, number) => acc * number)
}

export const MULTIPLY: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
