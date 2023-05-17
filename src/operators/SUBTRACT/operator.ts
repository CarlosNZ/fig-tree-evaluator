import { parseChildren } from '../AND/operator'
import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { OperatorObject, EvaluateMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [values, from, subtract] = (await evaluateArray(
    [expression.values, expression.from, expression.subtract],
    config
  )) as [[number, number], number, number]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values, from, subtract }))

  const vals = values ?? [from, subtract].filter((e) => e !== undefined)

  if (vals.length < 2) throw new Error('- Not enough values provided')
  if (vals.some((e) => typeof e !== 'number')) throw new Error('- Not all values are numbers')

  return vals[0] - vals[1]
}

export const SUBTRACT: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
