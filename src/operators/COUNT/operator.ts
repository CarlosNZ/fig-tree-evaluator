import { parseChildren } from '../AND/operator'
import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
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
