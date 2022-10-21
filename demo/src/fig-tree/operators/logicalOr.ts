import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../types'

const requiredProperties = ['values'] as const
const operatorAliases = ['or', '|', '||']
const propertyAliases = {}

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<boolean> => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]
  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })
  return values.reduce((acc: boolean, val: boolean) => acc || !!val, false)
}

export const OR: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
