import { EvaluatorOptions, EvaluatorNode, ValueNode, OutputType } from './types'
import { operatorObjects, getOperatorName, mapPropertyAliases } from './operatorReference'
import {
  checkRequiredNodes,
  fallbackOrError,
  convertOutputMethods,
  errorMessage,
  parseIfJson,
  isOperatorNode,
} from './helpers'

const evaluateExpression = async (
  input: EvaluatorNode,
  options?: EvaluatorOptions
): Promise<ValueNode> => {
  let expression = options?.allowJSONStringInput ? parseIfJson(input) : input

  // Non-operator nodes get returned unmodified
  if (!isOperatorNode(expression)) return expression

  const { fallback } = expression
  const outputType = expression?.type ?? expression?.outputType
  const returnErrorAsString = options?.returnErrorAsString ?? false

  try {
    const operator = getOperatorName(expression.operator)

    if (!operator)
      return fallbackOrError(
        fallback,
        `Invalid operator: ${expression.operator}`,
        returnErrorAsString
      )

    const { requiredProperties, propertyAliases, evaluate, parseChildren } = operatorObjects[
      operator
    ] as any // REMOVE ANY

    expression = mapPropertyAliases(propertyAliases, expression)

    const validationError = checkRequiredNodes(requiredProperties, expression)
    if (validationError) return fallbackOrError(fallback, validationError, returnErrorAsString)

    if ('children' in expression) expression = parseChildren(expression)

    const result = await evaluate(expression, options ?? {})

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
