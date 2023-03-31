import { parseChildren } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { EvaluateMethod, OperatorObject } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const values = await evaluateArray(expression.values, config)

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values }))

  return values.length
}

export const COUNT: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
