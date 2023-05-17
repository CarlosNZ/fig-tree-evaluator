import { zipArraysToObject, getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [string, substitutions] = (await evaluateArray(
    [expression.string, expression.substitutions],
    config
  )) as [string, string[]]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { string, substitutions }))

  const parameterPattern = /(%[\d]+)/g
  const parameters = (string.match(parameterPattern) || []).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1))
  )
  const uniqueParameters = new Set(parameters)
  const replacementsObj = zipArraysToObject(Array.from(uniqueParameters), substitutions)
  return string
    .split(parameterPattern)
    .map((fragment) => (fragment in replacementsObj ? replacementsObj[fragment] : fragment))
    .join('')
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [string, ...substitutions] = expression.children as EvaluatorNode[]
  return { ...expression, string, substitutions }
}

export const STRING_SUBSTITUTION: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
