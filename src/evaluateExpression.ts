import {
  EvaluatorOptions,
  EvaluatorNode,
  Operator,
  ValueNode,
  OperatorNode,
  OutputType,
} from './types'
import { operatorAliases, operatorMethods, mapPropertyAliases } from './operatorReference'
import {
  fallbackOrError,
  convertOutputMethods,
  standardiseOperatorName,
  errorMessage,
  parseIfJson,
} from './utils/utils'

const evaluateExpression = async (
  input: EvaluatorNode,
  options?: EvaluatorOptions
): Promise<ValueNode> => {
  const expression = options?.allowJSONStringInput ? parseIfJson(input) : input

  // Base cases -- leaves get returned unmodified
  if (!(expression instanceof Object)) return expression
  if (!('operator' in expression)) return expression

  const { fallback } = expression
  const returnErrorAsString = options?.returnErrorAsString ?? false

  try {
    const operator: Operator = operatorAliases?.[standardiseOperatorName(expression.operator)]

    if (!operator)
      return fallbackOrError(
        fallback,
        `Invalid operator: ${expression.operator}`,
        returnErrorAsString
      )

    const { parse, operate } = operatorMethods[operator]

    const childNodes =
      'children' in expression
        ? expression.children
        : parse(mapPropertyAliases(operator, expression as OperatorNode))

    if (!Array.isArray(childNodes)) {
      return fallbackOrError(fallback, 'Invalid child nodes (children) array', returnErrorAsString)
    }

    let childrenResolved: any[] = []

    // Recursive case

    childrenResolved = await Promise.all(
      childNodes.map((child: EvaluatorNode) => evaluateExpression(child, options))
    )

    const result = await operate({
      children: childrenResolved,
      expression: expression as OperatorNode,
      options,
    })

    if (!expression?.type) return result

    // Type conversion
    if (!(expression.type in convertOutputMethods))
      return fallbackOrError(
        fallback,
        `Invalid output type: ${expression.type}`,
        returnErrorAsString
      )
    else {
      return convertOutputMethods[expression.type as OutputType](result)
    }
  } catch (err) {
    return fallbackOrError(fallback, errorMessage(err), returnErrorAsString)
  }
}

export default evaluateExpression
