import { singleArrayToObject } from '../operatorUtils'
import { evaluatorFunction } from '../../evaluate'
import { evaluateArray } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import { isObject, isOperatorNode } from '../../helpers'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const matchExpression = (await evaluatorFunction(expression.matchExpression, config)) as
    | string
    | number

  config.typeChecker({
    name: 'matchExpression',
    value: matchExpression,
    expectedType: ['string', 'number', 'boolean'],
  })

  const branches = Array.isArray(expression.branches)
    ? singleArrayToObject(expression.branches)
    : (expression.branches ?? {})

  const branchObject = (
    isOperatorNode(branches) ? await evaluatorFunction(branches, config) : branches
  ) as Record<string, EvaluatorNode>

  if (!isObject(branchObject)) throw new Error("Branches don't evaluate to an object")

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

const parseChildren: ParseChildrenMethod = (expression) => {
  const [matchExpression, ...elements] = expression.children as EvaluatorNode[]
  const branches = singleArrayToObject(elements)

  return { ...expression, matchExpression, branches }
}

export const MATCH: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
