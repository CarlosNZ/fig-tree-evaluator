import { parseChildren, BasicExtendedNode } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../../types'
import operatorData, { requiredProperties, propertyAliases } from './data'

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<number> => {
  const values = (await evaluateArray(expression.values, config)) as number[]
  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values }))
  return values.reduce((acc, number) => acc * number)
}

export const MULTIPLY: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
