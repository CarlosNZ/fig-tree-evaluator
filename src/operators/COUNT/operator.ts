import { parseChildren, BasicExtendedNode } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../../types'

import operatorData, { requiredProperties, propertyAliases } from './data'

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<number> => {
  const values = await evaluateArray(expression.values, config)
  config.typeChecker(...getTypeCheckInput(operatorData.parameters, { values }))
  return values.length
}

export const COUNT: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
