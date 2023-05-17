import { getTypeCheckInput } from '../_operatorUtils'
import { evaluateArray } from '../../evaluate'
import { OperatorObject, EvaluatorNode, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const DEFAULT_DELIMITER = ' '

const evaluate: EvaluateMethod = async (expression, config) => {
  const [value, delimiter, trimWhiteSpace, excludeTrailing] = (await evaluateArray(
    [
      expression.value,
      expression.delimiter ?? DEFAULT_DELIMITER,
      expression.trimWhiteSpace ?? true,
      expression.excludeTrailing ?? true,
    ],
    config
  )) as [string, string, boolean, boolean]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, {
      value,
      delimiter,
      trimWhiteSpace,
      excludeTrailing,
    })
  )

  let splitValues = value.split(delimiter)
  if (trimWhiteSpace) splitValues = splitValues.map((val) => val.trim())
  if (excludeTrailing && splitValues[splitValues.length - 1] === '') splitValues.pop()

  return splitValues
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [value, delimiter = DEFAULT_DELIMITER] = expression.children as EvaluatorNode[]
  return { ...expression, value, delimiter }
}

export const SPLIT: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
