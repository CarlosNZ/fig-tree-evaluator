import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../types'
import { config } from 'process'

const requiredProperties = ['values'] as const
const operatorAliases = ['=', 'eq', 'equal', 'equals']
const propertyAliases = {}

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<boolean> => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]
  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })
  return values.every((value) => value == values[0])
}

export const EQUAL: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
