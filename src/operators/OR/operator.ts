import { parseChildren } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { EvaluateMethod, OperatorObject } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values }))

  return values.reduce((acc: boolean, val: boolean) => acc || !!val, false)
}

export const OR: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
