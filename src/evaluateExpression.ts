import {
  EvaluatorOptions,
  EvaluatorNode,
  Operator,
  ValueNode,
  BaseOperatorNode,
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
  isOperatorNode,
} from './helpers'

const evaluateExpression = async (
  input: EvaluatorNode,
  options?: EvaluatorOptions
): Promise<ValueNode> => {
  const expression = options?.allowJSONStringInput ? parseIfJson(input) : input

  // Non-operator nodes get returned unmodified
  if (!isOperatorNode(expression)) return expression

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
        : await parse(mapPropertyAliases(operator, expression as OperatorNode), options)

    if (!Array.isArray(childNodes)) {
      return fallbackOrError(fallback, 'Invalid child nodes (children) array', returnErrorAsString)
    }

    let childrenResolved: any[] = []

    // Evaluate children recursively
    childrenResolved = await Promise.all(
      childNodes.map((child: EvaluatorNode) => evaluateExpression(child, options))
    )

    const result = await operate({
      children: childrenResolved,
      expression: expression as BaseOperatorNode,
      options,
    })

    const outputType = expression?.type ?? expression?.outputType

    if (!outputType) return result

    // Type conversion
    if (!(outputType in convertOutputMethods))
      return fallbackOrError(fallback, `Invalid output type: ${outputType}`, returnErrorAsString)
    else {
      return convertOutputMethods[expression.type as OutputType](result)
    }
  } catch (err) {
    return fallbackOrError(fallback, errorMessage(err), returnErrorAsString)
  }
}

export default evaluateExpression
