/*
The core evaluation function used by FigTreeEvaluator
*/

import { FigTreeConfig, EvaluatorNode, EvaluatorOutput, OutputType, OperatorNode } from './types'
import { evaluateArray } from './operators/_operatorUtils'
import { preProcessShorthand } from './shorthandSyntax'
import {
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
  isFragmentNode,
  isObject,
} from './helpers'

export const evaluatorFunction = async (
  input: EvaluatorNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const { options, operators, operatorAliases } = config

  let expression = options?.allowJSONStringInput ? parseIfJson(input) : input

  // Convert any shorthand syntax into standard expression structure
  expression = preProcessShorthand(expression, config.options?.fragments, !options.noShorthand)

  // If an array, we evaluate each item in the array
  if (Array.isArray(expression)) {
    expression = await evaluateArray(expression, config)
  }

  const isOperator = isOperatorNode(expression)
  const isFragment = isFragmentNode(expression)

  // If "evaluateFullObject" option is on, dive deep into objects to find
  // Operator Nodes
  if (options.evaluateFullObject && !isOperator && !isFragment)
    return replaceAliasNodeValues(await evaluateObject(expression, config), config)

  // Base case -- Non-operator (leaf) nodes get returned unmodified (or
  // substituted if an alias reference)
  if (!isOperator && !isFragment) {
    // Return deprecated (< v1) "value" nodes
    if (options.supportDeprecatedValueNodes && isObject(expression) && 'value' in expression)
      return expression.value as EvaluatorOutput

    return replaceAliasNodeValues(expression, config)
  }

  const { fallback } = expression
  const returnErrorAsString = options?.returnErrorAsString ?? false

  // Replace any fragments with their full expressions
  if (isFragment) {
    const [fragment, parameters] = (await evaluateArray(
      [expression.fragment, expression.parameters],
      config
    )) as [string, { [key: string]: EvaluatorNode }]
    const fragmentReplacement = preProcessShorthand(
      options?.fragments?.[fragment],
      options.fragments,
      !options.noShorthand
    )
    if (fragmentReplacement === undefined)
      return fallbackOrError(
        await evaluatorFunction(fallback, config),
        `Fragment not defined: ${fragment}`,
        returnErrorAsString
      )
    if (!isOperatorNode(fragmentReplacement))
      return replaceAliasNodeValues(fragmentReplacement, config)
    expression = { ...expression, ...(fragmentReplacement as OperatorNode), ...parameters }
    delete expression.fragment
    delete expression.parameters
  }

  try {
    const operator = getOperatorName(expression.operator, operatorAliases)

    if (!operator)
      return fallbackOrError(
        await evaluatorFunction(fallback, config),
        `Invalid operator: ${expression.operator}`,
        returnErrorAsString
      )

    if (!config.operators[operator])
      return fallbackOrError(
        await evaluatorFunction(fallback, config),
        `Excluded operator: ${expression.operator}`,
        returnErrorAsString
      )

    const { propertyAliases, evaluate, parseChildren } = operators[operator]

    expression = mapPropertyAliases(propertyAliases, expression)

    // Evaluate any alias nodes defined at this level and save them in "config"
    // object so they get accumulated as we progress down the tree.
    const newAliasNodes = await evaluateNodeAliases(expression, config)
    if (!isFragment)
      // It is important to mutate this object in place rather than create a
      // shallow copy, or else we can end up with different versions replacing
      // each other due to parallel evaluation
      Object.entries(newAliasNodes).forEach(
        ([alias, result]) => (config.resolvedAliasNodes[alias] = result)
      )

    // For fragments, we create a new instance of the config object with
    // different resolved aliases -- this is because there may be more than one
    // use of the same fragment at different places in the evaluation, and they
    // each need their own unique instance of their resolved parameter alias.
    const childConfig: FigTreeConfig = isFragment
      ? { ...config, resolvedAliasNodes: { ...config.resolvedAliasNodes, ...newAliasNodes } }
      : config

    // If using "children" property, convert children array to expected
    // properties
    if ('children' in expression) {
      if (!Array.isArray(expression.children))
        expression.children = await evaluatorFunction(expression.children, childConfig)
      if (!Array.isArray(expression.children))
        return fallbackOrError(
          await evaluatorFunction(fallback, config),
          `Operator: ${operator}\n- Property "children" is not of type: array`,
          returnErrorAsString
        )
      expression = await parseChildren(expression, childConfig)
      delete expression.children
    }

    // Recursively evaluate node
    let result
    try {
      result = await evaluate(expression, childConfig)
    } catch (err) {
      return fallbackOrError(
        await evaluatorFunction(expression.fallback, config),
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
