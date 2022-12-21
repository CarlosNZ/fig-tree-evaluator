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
import { isOperatorNode } from '../helpers'

const requiredProperties = ['matchExpression'] as const
const operatorAliases = ['match', 'switch']
const propertyAliases = { arms: 'branches', cases: 'branches', match: 'matchExpression' }

export type MatchNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (expression: MatchNode, config: FigTreeConfig): Promise<EvaluatorOutput> => {
  const matchExpression = (await evaluatorFunction(expression.matchExpression, config)) as
    | string
    | number

  const branches = expression.branches

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

  let branchObject = Array.isArray(branches) ? singleArrayToObject(branches) : branches ?? {}

  if (isOperatorNode(branchObject)) branchObject = await evaluatorFunction(branchObject, config)

  // Unlike most operators, where we evaluate the entire node at once, in this
  // one we only evaluate the *matching* branch to avoid unnecessary computation
  // of unused branches
  if (matchExpression in branchObject)
    return await evaluatorFunction(branchObject[matchExpression], config)

  // We need to handle "fallback" separately in this case, as the entire
  // "branches" object won't be evaluated (as per previous comment)
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
