import { evaluateArray, singleArrayToObject } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['matchExpression'] as const
const operatorAliases = ['match', 'switch']
const propertyAliases = { arms: 'branches', match: 'matchExpression' }

export type MatchNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (expression: MatchNode, config: FigTreeConfig): Promise<EvaluatorOutput> => {
  const [matchExpression, branches] = (await evaluateArray(
    [expression.matchExpression, expression.branches],
    config
  )) as [string, any[] | { [key: string]: any }]

  config.typeChecker(
    {
      name: 'matchExpression',
      value: matchExpression,
      expectedType: ['string', 'number', 'boolean'],
    },
    {
      name: 'branches',
      value: branches,
      expectedType: ['object', 'array'],
    }
  )

  const branchObject = Array.isArray(branches) ? singleArrayToObject(branches) : branches

  console.log('branchObject', branchObject)

  if (matchExpression in branchObject) return branchObject[matchExpression]

  if (matchExpression in expression) return expression[matchExpression]

  throw new Error(`No match found for ${matchExpression}`)
}

const parseChildren = (expression: CombinedOperatorNode): MatchNode => {
  const [match, ...elements] = expression.children as EvaluatorNode[]
  const branches = singleArrayToObject(elements)

  return { ...expression, match, branches }
}

export const MATCH: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
