import extractProperty from 'object-property-extractor'
import { zipArraysToObject, getTypeCheckInput } from '../operatorUtils'
import { evaluateArray, evaluatorFunction } from '../../evaluate'
import {
  EvaluatorNode,
  OperatorObject,
  EvaluateMethod,
  ParseChildrenMethod,
  FigTreeConfig,
} from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [
    string,
    substitutions = {},
    trimWhiteSpace = true,
    substitutionCharacter = '%',
    numberMapping = {},
  ] = (await evaluateArray(
    [
      expression.string,
      expression.substitutions,
      expression.trimWhiteSpace,
      expression.substitutionCharacter,
      expression.numberMapping,
    ],
    config
  )) as [string, string[], boolean, '%' | '$', NumberMap]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, {
      string,
      substitutions,
      trimWhiteSpace,
      substitutionCharacter,
      numberMapping,
    })
  )

  if (Array.isArray(substitutions)) {
    // Positional (%1, %2) replacements
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

  // {{Named}} replacements
  const parameterPattern = /(?<!\\)({{(?:[A-Za-z0-9_.]|\[[0-9]+\])+}})/g

  const replaced = []

  for (const fragment of string.split(parameterPattern)) {
    if (!/(?<!\\){{(.+)}}/.exec(fragment)) {
      replaced.push(fragment.replace('\\{{', '{{'))
      continue
    }
    const replacement = await getReplacement(fragment, substitutions, numberMapping, config)
    replaced.push(trimWhiteSpace ? String(replacement).trim() : replacement)
  }

  return replaced.join('')
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

interface NumberMap {
  [key: string]: { [key: string]: string }
}

const getReplacement = async (
  fragment: string,
  replacements: { [key: string]: unknown },
  numberMaps: NumberMap,
  config: FigTreeConfig
) => {
  const data = config.options?.data ?? {}
  const key = fragment.replace(/{{(.+)}}/, '$1')
  // Need to evaluate each replacement, as they won't be reached it
  // `evaluateFullObject` is not enabled
  const value = await evaluatorFunction(
    extractProperty(replacements, key, extractProperty(data, key, '')),
    config
  )

  if (typeof value !== 'number') return value

  // Value is a number, so check number mappings
  if (!(key in numberMaps)) return value

  const numMap = numberMaps[key]
  if (value in numMap) return numMap[value].replace('{}', String(value))

  // Check for greater/less than keys
  const numberKeys = Object.keys(numberMaps[key])
  const greaterThanKey = numberKeys.find((key) => key.startsWith('>'))
  if (greaterThanKey) {
    const num = Number(greaterThanKey.slice(1))
    if (value > num) return numMap?.[greaterThanKey]
  }

  const lessThanKey = numberKeys.find((key) => key.startsWith('<'))
  if (lessThanKey) {
    const num = Number(lessThanKey.slice(1))
    if (value < num) return numMap?.[lessThanKey]
  }

  return numMap.other ? numMap.other.replace('{}', String(value)) : value
}
