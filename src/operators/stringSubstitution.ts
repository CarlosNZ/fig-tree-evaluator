import { evaluateArray, zipArraysToObject } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  ValueNode,
  EvaluatorConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['string', 'substitutions'] as const
const operatorAliases = ['stringSubstitution', 'substitute', 'stringSub', 'replace']
const propertyAliases = { replacements: 'substitutions' }

export type StringSubNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (expression: StringSubNode, config: EvaluatorConfig): Promise<ValueNode> => {
  const [string, ...substitutions] = (await evaluateArray(
    [expression.string, ...(expression.substitutions as EvaluatorNode[])],
    config
  )) as [string, string[]]
  const regex = /%([\d]+)/g // To-Do: handle escaping literal values
  const parameters = (string.match(regex) || []).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1))
  )
  const uniqueParameters = new Set(parameters)
  const replacementsObj = zipArraysToObject(Array.from(uniqueParameters), substitutions)
  let outputString = string
  Object.entries(replacementsObj)
    .reverse()
    .forEach(([param, replacement]) => {
      outputString = outputString.replace(new RegExp(`${param}`, 'g'), replacement ?? '')
    })
  return outputString
}

const parseChildren = (expression: CombinedOperatorNode): StringSubNode => {
  const [string, ...substitutions] = expression.children as EvaluatorNode[]
  return { ...expression, string, substitutions }
}

export const STRING_SUBSTITUTION: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
