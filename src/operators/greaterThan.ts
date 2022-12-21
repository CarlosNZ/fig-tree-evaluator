import { evaluateArray } from './_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../types'
import { parseChildren, BasicExtendedNode } from './logicalAnd'

const requiredProperties = ['values'] as const
const operatorAliases = ['>', 'greaterThan', 'higher', 'larger']
const aliasExtensions = [{ '>=': { strict: false } }] // To-do - Issue #22
const propertyAliases = {}

export type ComparatorNode = BasicExtendedNode & { strict?: boolean }

const evaluate = async (expression: ComparatorNode, config: FigTreeConfig): Promise<boolean> => {
  const [values, strict = true] = (await evaluateArray(
    [expression.values, expression.strict],
    config
  )) as [(string | number)[], boolean]

  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })

  if (values.length < 2) throw new Error('- Not enough values provided')

  const [first, second] = values

  if (first === second && !strict) return true

  return first > second
}

export const GREATER_THAN: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
