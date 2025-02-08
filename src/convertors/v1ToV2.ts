/**
 * Convert a FigTree expression in V1 syntax (i.e. with `children` array in each
 * operator node) to V2 syntax
 */

import { FigTreeEvaluator } from '../FigTreeEvaluator'
import { isObject, standardiseOperatorName } from '../helpers'
import { EvaluatorNode, OperatorNode } from '../types'

export const convertV1ToV2 = async (figTree: FigTreeEvaluator, expression: EvaluatorNode) => {
  if (!isObject(expression)) return expression

  const operators = figTree.getOperators()

  const newExpression = isV1Node(expression)
    ? await (async () => {
        const { operator } = expression
        const standardisedOpName = standardiseOperatorName(operator)
        const operatorRef = operators.find(
          (op) => op.name === standardisedOpName || op.aliases.includes(standardisedOpName)
        )
        if (operatorRef) {
          const result = await operatorRef.parseChildren(expression, figTree.getConfig())
          delete result.children
          const preferredOpName = operatorRef.aliases[0]
          result.operator = preferredOpName
          return result
        } else throw new Error('Invalid operator: ' + operator)
      })()
    : expression

  const outputExpression: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(newExpression as object)) {
    const modifiedKey = key === 'type' ? 'outputType' : key
    if (Array.isArray(value)) {
      const newArray = value.map((val) => convertV1ToV2(figTree, val))
      const resolved = await Promise.all(newArray)
      outputExpression[modifiedKey] = resolved
    } else outputExpression[modifiedKey] = await convertV1ToV2(figTree, value)
  }

  return outputExpression
}

const isV1Node = (node: EvaluatorNode): node is OperatorNode =>
  isObject(node) && 'operator' in node && 'children' in node && Array.isArray(node.children)
