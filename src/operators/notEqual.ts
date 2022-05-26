import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_helpers'
import { EvaluatorConfig } from '../types'

const requiredProperties = ['values']
const operatorAliases = ['!=', '!', 'ne', 'notEqual']
const propertyAliases = {}

const evaluate = async (
  expression: BasicExtendedNode,
  config: EvaluatorConfig
): Promise<Boolean> => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]
  return values[0] != values[1]
}

export const NOT_EQUAL = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
