import { parseChildren, BasicExtendedNode } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../../types'

import operatorData, { requiredProperties, propertyAliases } from './data'

// const aliasExtensions = [{ '>=': { strict: false } }] // To-do - Issue #22

export type ComparatorNode = BasicExtendedNode & { strict?: boolean }

const evaluate = async (expression: ComparatorNode, config: FigTreeConfig): Promise<boolean> => {
  const [values, strict = true] = (await evaluateArray(
    [expression.values, expression.strict],
    config
  )) as [(string | number)[], boolean]

  config.typeChecker(...getTypeCheckInput(operatorData.parameters, { values, strict }))

  if (values.length < 2) throw new Error('- Not enough values provided')

  const [first, second] = values

  if (first === second && !strict) return true

  return first > second
}

export const GREATER_THAN: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
