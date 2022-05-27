import { EvaluatorConfig, EvaluatorNode, ValueNode, OutputType } from './types'
import { evaluateArray } from './operators/_operatorUtils'
import {
  checkRequiredNodes,
  fallbackOrError,
  convertOutputMethods,
  errorMessage,
  parseIfJson,
  isOperatorNode,
  mapPropertyAliases,
  getOperatorName,
} from './helpers'

export const evaluatorFunction = async (
  input: EvaluatorNode,
  config: EvaluatorConfig
): Promise<ValueNode> => {
  const { options, operators, operatorAliases } = config

  let expression = options?.allowJSONStringInput ? parseIfJson(input) : input

  // If an array, we evaluate each item in the array
  if (Array.isArray(expression)) {
    expression = await evaluateArray(expression, config)
  }

  // Non-operator nodes get returned unmodified
  if (!isOperatorNode(expression)) return expression

  const { fallback } = expression
  const outputType = expression?.type ?? expression?.outputType
  const returnErrorAsString = options?.returnErrorAsString ?? false

  try {
    const operator = getOperatorName(expression.operator, operatorAliases)

    if (!operator)
      return fallbackOrError(
        await evaluatorFunction(fallback, config),
        `Invalid operator: ${expression.operator}`,
        returnErrorAsString
      )

    const { requiredProperties, propertyAliases, evaluate, parseChildren } = operators[operator]

    expression = mapPropertyAliases(propertyAliases, expression)

    const validationError = checkRequiredNodes(requiredProperties, expression)
    if (validationError)
      return fallbackOrError(
        await evaluatorFunction(fallback, config),
        validationError,
        returnErrorAsString
      )

    if ('children' in expression) expression = await parseChildren(expression, config)

    const result = await evaluate(expression, config)

    if (!outputType) return result

    // Type conversion
    if (!(outputType in convertOutputMethods))
      return fallbackOrError(
        await evaluatorFunction(fallback, config),
        `Invalid output type: ${outputType}`,
        returnErrorAsString
      )
    else {
      return convertOutputMethods[expression.type as OutputType](result)
    }
  } catch (err) {
    return fallbackOrError(
      await evaluatorFunction(fallback, config),
      errorMessage(err),
      returnErrorAsString
    )
  }
}
