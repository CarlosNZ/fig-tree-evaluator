import { evaluateArray, zipArraysToObject, getTypeCheckInput } from '../_operatorUtils'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [string, substitutions, trimWhiteSpace = true, substitutionCharacter = '%'] =
    (await evaluateArray(
      [
        expression.string,
        expression.substitutions,
        expression.trimWhiteSpace,
        expression.substitutionCharacter,
      ],
      config
    )) as [string, string[], boolean, '%' | '$']

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, {
      string,
      substitutions,
      trimWhiteSpace,
      substitutionCharacter,
    })
  )

  const subChar = substitutionCharacter === '$' ? '$' : '%'

  // Escaped chars are double-escaped
  const patternString = `(?<!\\\\)(${subChar === '%' ? '%' : '\\$'}[\\d]+)`
  const parameterPattern = new RegExp(patternString, 'g')

  const parameters = (string.match(parameterPattern) || []).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1))
  )
  const uniqueParameters = new Set(parameters)
  const replacementsObj = zipArraysToObject(
    Array.from(uniqueParameters),
    substitutions.map((sub) => (trimWhiteSpace ? String(sub).trim() : sub))
  )
  return (
    string
      .split(parameterPattern)
      .map((fragment) => (fragment in replacementsObj ? replacementsObj[fragment] : fragment))
      .join('')
      // Remove escape character
      .replace(`\\${subChar}`, subChar)
  )
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
