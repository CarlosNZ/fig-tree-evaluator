import { evaluateArray, singleArrayToObject } from './_operatorUtils'
import { evaluatorFunction } from '../evaluate'
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
const propertyAliases = { arms: 'branches', cases: 'branches', match: 'matchExpression' }

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
      expectedType: ['object', 'array', 'undefined'],
    }
  )

  const branchObject = Array.isArray(branches) ? singleArrayToObject(branches) : branches ?? {}

  if (matchExpression in branchObject)
    return await evaluatorFunction(branchObject[matchExpression], config)

  // We need to handle "fallback" separately in this case, as the "branchObject"
  // is not evaluated as a whole, but only for each branch/key as required
  // (otherwise we'd be evaluating a lot of nodes that are never used)
  if ('fallback' in branchObject) return await evaluatorFunction(branchObject.fallback, config)

  if (matchExpression in expression)
    return await evaluatorFunction(expression[matchExpression], config)

  throw new Error(`No match found for ${matchExpression}`)
}

const parseChildren = async (
  expression: CombinedOperatorNode,
  config: FigTreeConfig
): Promise<MatchNode> => {
  const [matchExpression, ...elements] = expression.children as EvaluatorNode[]
  const branches = singleArrayToObject(await evaluateArray(elements, config))

  return { ...expression, matchExpression, branches }
}

export const MATCH: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
