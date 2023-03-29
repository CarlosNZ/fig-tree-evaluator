import { evaluateArray, zipArraysToObject, getTypeCheckInput } from '../_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../../types'
import operatorData, { requiredProperties, propertyAliases } from './data'

export type StringSubNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (
  expression: StringSubNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const [string, substitutions] = (await evaluateArray(
    [expression.string, expression.substitutions],
    config
  )) as [string, string[]]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { string, substitutions }))

  const regex = /(%[\d]+)/g
  const parameters = (string.match(regex) || []).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1))
  )
  const uniqueParameters = new Set(parameters)
  const replacementsObj = zipArraysToObject(Array.from(uniqueParameters), substitutions)
  return string
    .split(regex)
    .map((fragment) => (fragment in replacementsObj ? replacementsObj[fragment] : fragment))
    .join('')
}

const parseChildren = (expression: CombinedOperatorNode): StringSubNode => {
  const [string, ...substitutions] = expression.children as EvaluatorNode[]
  return { ...expression, string, substitutions }
}

export const STRING_SUBSTITUTION: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
