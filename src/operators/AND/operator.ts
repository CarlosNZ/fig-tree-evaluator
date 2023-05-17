import { getTypeCheckInput } from '../_operatorUtils'
import { evaluateArray } from '../../evaluate'
import { OperatorObject, ParseChildrenMethod, EvaluateMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const values = (await evaluateArray(expression.values, config)) as boolean[]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values }))

  return values.reduce((acc: boolean, val: boolean) => acc && !!val, true)
}

export const parseChildren: ParseChildrenMethod = (expression) => {
  const values = expression.children
  return { ...expression, values }
}

export const AND: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
