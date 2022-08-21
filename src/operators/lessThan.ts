import { evaluateArray } from './_operatorUtils'
import { EvaluatorConfig, OperatorObject } from '../types'
import { parseChildren } from './logicalAnd'
import { ComparatorNode } from './greaterThan'

const requiredProperties = ['values'] as const
const operatorAliases = ['<', 'lessThan', 'lower', 'smaller']
const aliasExtensions = [{ '<=': { strict: false } }] // To-do
const propertyAliases = {}

const evaluate = async (expression: ComparatorNode, config: EvaluatorConfig): Promise<boolean> => {
  const [values, strict = true] = (await evaluateArray(
    [expression.values, expression.strict],
    config
  )) as [(string | number)[], boolean]

  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })

  if (values.length < 2) throw new Error('- Not enough values provided')

  const [first, second] = values

  if (first === second && !strict) return true

  return first < second
}

export const LESS_THAN: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
