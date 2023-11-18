import { parseChildren } from '../AND/operator'
import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluateMethod, OperatorObject } from '../../types'
import { dequal } from 'dequal/lite'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [values, caseInsensitive, nullMatch] = (await evaluateArray(
    [expression.values, expression.caseInsensitive, expression.nullEqualsUndefined],
    config
  )) as [unknown[], boolean, boolean]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, {
      values,
      caseInsensitive,
      nullEqualsUndefined: nullMatch,
    })
  )

  const isCaseInsensitive =
    caseInsensitive !== undefined ? caseInsensitive : config.options?.caseInsensitive ?? false

  const newValues =
    isCaseInsensitive && values.every((val) => typeof val === 'string')
      ? values.map((val) => (val as string).toLowerCase())
      : values

  const nullEqualsUndefined =
    nullMatch !== undefined
      ? nullMatch
      : config.options?.nullEqualsUndefined !== undefined
      ? config.options.nullEqualsUndefined
      : false

  if (nullEqualsUndefined && (newValues[0] === null || newValues[0] === undefined))
    return newValues.every((value) => value === null || value === undefined)

  return newValues.every((value) => dequal(value, newValues[0]))
}

export const EQUAL: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
