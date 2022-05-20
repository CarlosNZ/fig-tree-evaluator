import { EvaluatorOptions, EvaluatorNode, Operator, ValueNode, OperatorNode } from './types'
import { operatorReference, operatorMethods } from './operatorReference'
import {
  fallbackOrError,
  convertOutputMethods,
  standardiseOperatorName,
  errorMessage,
} from './utils/utils'

const evaluateExpression = async (
  expression: EvaluatorNode,
  options: EvaluatorOptions
): Promise<ValueNode> => {
  // TO-DO Check for JSON String

  // Base cases -- leaves get returned unmodified
  if (!(expression instanceof Object) || expression === null) return expression
  if (!('operator' in expression)) return expression

  const operator: Operator = operatorReference?.[standardiseOperatorName(expression.operator)]

  const { fallback } = expression

  if (!operator) return fallbackOrError(fallback, `Invalid operator: ${expression.operator}`)

  const { parse, operate } = operatorMethods[operator]

  const childNodes =
    'children' in expression ? expression.children : parse(expression as OperatorNode)

  let childrenResolved: any[] = []
  // Recursive case
  try {
    childrenResolved = await Promise.all(
      childNodes.map((child: EvaluatorNode) => evaluateExpression(child, options))
    )
  } catch (err) {
    return fallbackOrError(fallback, errorMessage(err))
  }

  let result: ValueNode

  try {
    result = await operate({
      children: childrenResolved,
      expression: expression as OperatorNode,
      options,
    })
  } catch (err) {
    return fallbackOrError(fallback, errorMessage(err))
  }

  if (!expression?.type) return result

  // Type conversion
  if (!(expression.type in convertOutputMethods))
    return fallbackOrError(fallback, `Invalid output type: ${expression.type}`)
}

export default evaluateExpression
