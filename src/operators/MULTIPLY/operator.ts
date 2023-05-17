import { parseChildren } from '../AND/operator'
import { getTypeCheckInput } from '../_operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluateMethod, OperatorObject } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
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
