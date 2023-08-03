import { parseChildren } from '../AND/operator'
import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluateMethod, OperatorObject } from '../../types'
import { dequal } from 'dequal/lite'

import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [values, nullMatch] = (await evaluateArray(
    [expression.values, expression.nullEqualsUndefined],
    config
  )) as [unknown[], boolean]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, { values, nullEqualsUndefined: nullMatch })
  )

  const nullEqualsUndefined =
    nullMatch !== undefined
      ? nullMatch
      : config.options?.nullEqualsUndefined !== undefined
      ? config.options.nullEqualsUndefined
      : false

  if (nullEqualsUndefined && (values[0] === null || values[0] === undefined))
    return values.some((value) => value === null && value === undefined)

  return values.some((val) => !dequal(val, values[0]))
}

export const NOT_EQUAL: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
