import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_helpers'
import { EvaluatorOptions } from '../types'

const requiredProperties = ['values']
const operatorAliases = ['or', '|', '||']
const propertyAliases = {}

const evaluate = async (
  expression: BasicExtendedNode,
  options: EvaluatorOptions
): Promise<Boolean> => {
  const values = (await evaluateArray(expression.values, options)) as boolean[]
  return values.reduce((acc: boolean, val: boolean) => acc || val, false)
}

export const OR = { requiredProperties, operatorAliases, propertyAliases, evaluate, parseChildren }
