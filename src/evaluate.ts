import { FigTreeConfig, EvaluatorNode, EvaluatorOutput, OutputType } from './types'
import { evaluateArray } from './operators/_operatorUtils'
import {
  checkRequiredNodes,
  fallbackOrError,
  convertOutputMethods,
  errorMessage,
  parseIfJson,
  isOperatorNode,
  mapPropertyAliases,
  evaluateNodeAliases,
  getOperatorName,
  replaceAliasNodeValues,
  evaluateObject,
} from './helpers'

// The core evaluation function used by FigTree
export const evaluatorFunction = async (
  input: EvaluatorNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const { options, operators, operatorAliases } = config

  let expression = options?.allowJSONStringInput ? parseIfJson(input) : input

  // If an array, we evaluate each item in the array
  if (Array.isArray(expression)) {
    expression = await evaluateArray(expression, config)
  }

  // If "evaluateFullObject" option is on, dive deep into objects to find
  // Operator Nodes
  if (options.evaluateFullObject && !isOperatorNode(expression))
    return replaceAliasNodeValues(await evaluateObject(expression, config), config)

  // Base case -- Non-operator nodes get returned unmodified (or substituted if
  // an alias reference)
  if (!isOperatorNode(expression)) return replaceAliasNodeValues(expression, config)

  const { fallback } = expression
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

    // Evaluate any alias nodes defined at this level and save them in "config"
    // object so they get accumulated as we progress down the tree
    config.resolvedAliasNodes = {
      ...config.resolvedAliasNodes,
      ...(await evaluateNodeAliases(expression, config)),
    }

    const validationError = checkRequiredNodes(requiredProperties, expression)
    if (validationError)
      return fallbackOrError(
        await evaluatorFunction(fallback, config),
        `Operator: ${operator}\n- ${validationError}`,
        returnErrorAsString
      )

    // If using "children" property, convert children array to expected
    // properties
    if ('children' in expression) {
      if (!Array.isArray(expression.children))
        expression.children = await evaluatorFunction(expression.children, config)
      if (!Array.isArray(expression.children))
        return fallbackOrError(
          await evaluatorFunction(fallback, config),
          `Operator: ${operator}\n- Property "children" is not of type: array`,
          returnErrorAsString
        )
      expression = await parseChildren(expression, config)
    }

    // Recursively evaluate node
    let result
    try {
      result = await evaluate(expression, config)
    } catch (err) {
      result = fallbackOrError(
        await evaluatorFunction(fallback, config),
        `Operator: ${operator}\n${errorMessage(err)}`,
        returnErrorAsString
      )
    }

    const outputType = expression?.outputType ?? expression?.type
    if (!outputType) return result

    const evaluatedOutputType = (await evaluatorFunction(outputType, config)) as OutputType

    // Output type conversion
    if (!(evaluatedOutputType in convertOutputMethods))
      return fallbackOrError(
        await evaluatorFunction(fallback, config),
        `Operator: ${operator}\n- Invalid output type: ${evaluatedOutputType}`,
        returnErrorAsString
      )
    else {
      return convertOutputMethods[evaluatedOutputType](result)
    }
  } catch (err) {
    return fallbackOrError(
      await evaluatorFunction(fallback, config),
      errorMessage(err),
      returnErrorAsString
    )
  }
}
