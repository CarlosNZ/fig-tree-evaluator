import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_helpers'
import { EvaluatorConfig } from '../types'

const requiredProperties = ['values']
const operatorAliases = ['=', 'eq', 'equal', 'equals']
const propertyAliases = {}

const evaluate = async (
  expression: BasicExtendedNode,
  options: EvaluatorConfig
): Promise<Boolean> => {
  const values = (await evaluateArray(expression.values, options)) as boolean[]
  return values.every((value) => value == values[0])
}

export const EQUAL = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
