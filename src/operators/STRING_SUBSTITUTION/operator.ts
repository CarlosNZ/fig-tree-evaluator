import { evaluateArray, zipArraysToObject, getTypeCheckInput } from '../_operatorUtils'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [string, substitutions, trimWhiteSpace = true] = (await evaluateArray(
    [expression.string, expression.substitutions, expression.trimWhiteSpace],
    config
  )) as [string, string[], boolean]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, { string, substitutions, trimWhiteSpace })
  )

  const parameterPattern = /(%[\d]+)/g
  const parameters = (string.match(parameterPattern) || []).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1))
  )
  const uniqueParameters = new Set(parameters)
  const replacementsObj = zipArraysToObject(
    Array.from(uniqueParameters),
    substitutions.map((sub) => (trimWhiteSpace ? String(sub).trim() : sub))
  )
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
