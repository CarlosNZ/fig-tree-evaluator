import { parseChildren, BasicExtendedNode } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate = async (expression: BasicExtendedNode, config: FigTreeConfig): Promise<number> => {
  const values = (await evaluateArray(expression.values, config)) as number[]
  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values }))

  if (values.length === 0) return 0
  if (values.some((e) => typeof e !== 'number')) throw new Error('- Not all values are numbers')
  return values.reduce((acc, number) => acc * number)
}

export const MULTIPLY: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
