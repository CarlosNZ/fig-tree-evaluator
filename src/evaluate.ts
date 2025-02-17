/*
The core evaluation function used by FigTreeEvaluator
*/

import {
  FigTreeConfig,
  EvaluatorNode,
  EvaluatorOutput,
  OutputType,
  OperatorNode,
  FragmentNode,
} from './types'
import { preProcessShorthand } from './shorthandSyntax'
import { fallbackOrError } from './FigTreeError'
import {
  convertOutputMethods,
  parseIfJson,
  isOperatorNode,
  mapPropertyAliases,
  getOperatorName,
  replaceAliasNodeValues,
  isFragmentNode,
  isObject,
  isAliasString,
  replaceCustomOperator,
} from './helpers'
import { zipArraysToObject, singleArrayToObject } from './operators/operatorUtils'

export const evaluatorFunction = async (
  input: EvaluatorNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const { options, operators, operatorAliases } = config

  let expression = options?.allowJSONStringInput ? parseIfJson(input) : input

  const functionNames = Object.keys(config.options?.functions ?? {})

  // Convert any shorthand syntax into standard expression structure
  expression = preProcessShorthand(
    expression,
    config.options?.fragments,
    functionNames,
    !options.noShorthand
  )

  // If an array, we evaluate each item in the array
  if (Array.isArray(expression)) {
    expression = await evaluateArray(expression, config)
  }

  const isOperator = isOperatorNode(expression)
  const isFragment = isFragmentNode(expression)

  if (isOperator) expression = await replaceCustomOperator(expression as OperatorNode, config)

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

  const { fallback } = expression as OperatorNode
  const returnErrorAsString = options?.returnErrorAsString ?? false

  // Replace any fragments with their full expressions
  if (isFragment) {
    const fragmentExpression = expression as FragmentNode
    const [fragment, parameters] = (await evaluateArray(
      [fragmentExpression.fragment, fragmentExpression.parameters],
      config
    )) as [string, { [key: string]: EvaluatorNode }]
    const fragmentReplacement = preProcessShorthand(
      options?.fragments?.[fragment],
      options.fragments,
      functionNames,
      !options.noShorthand
    )
    if (fragmentReplacement === undefined)
      return fallbackOrError({
        fallback: await evaluatorFunction(fallback, config),
        error: `Fragment not defined: ${fragment}`,
        expression,
        returnErrorAsString,
      })
    if (!isOperatorNode(fragmentReplacement))
      return replaceAliasNodeValues(fragmentReplacement, config)
    expression = { ...fragmentExpression, ...(fragmentReplacement as OperatorNode), ...parameters }
    delete (expression as OperatorNode).fragment
  }

  const operatorExpression = expression as OperatorNode

  const operator = getOperatorName(operatorExpression.operator, operatorAliases)

  if (!operator)
    return fallbackOrError({
      fallback: await evaluatorFunction(fallback, config),
      error: `Invalid operator: ${operatorExpression.operator}`,
      expression,
      returnErrorAsString,
    })

  if (!config.operators[operator])
    return fallbackOrError({
      fallback: await evaluatorFunction(fallback, config),
      error: `Excluded operator: ${operatorExpression.operator}`,
      expression,
      returnErrorAsString,
    })

  const { propertyAliases, evaluate, parseChildren } = operators[operator]

  let finalOperatorExpression = mapPropertyAliases(
    propertyAliases,
    operatorExpression
  ) as OperatorNode

  // Evaluate any alias nodes defined at this level and save them in "config"
  // object so they get accumulated as we progress down the tree.
  const newAliasNodes = await evaluateNodeAliases(finalOperatorExpression, config)
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
  if ('children' in finalOperatorExpression) {
    if (!Array.isArray(finalOperatorExpression.children))
      finalOperatorExpression.children = (await evaluatorFunction(
        finalOperatorExpression.children,
        childConfig
      )) as EvaluatorNode[]
    if (!Array.isArray(finalOperatorExpression.children))
      return fallbackOrError({
        fallback: await evaluatorFunction(fallback, config),
        operator,
        name: 'Type Error',
        error: `- Property "children" is not of type: array`,
        expression,
        returnErrorAsString,
      })
    try {
      finalOperatorExpression = await parseChildren(finalOperatorExpression, childConfig)
      delete finalOperatorExpression.children
    } catch (error) {
      return fallbackOrError({
        fallback: await evaluatorFunction(finalOperatorExpression.fallback, config),
        operator,
        error: error as Error,
        expression: finalOperatorExpression,
        returnErrorAsString,
      })
    }
  }

  // Recursively evaluate node
  let result
  try {
    result = await evaluate(finalOperatorExpression, childConfig)
  } catch (error) {
    return fallbackOrError({
      fallback: await evaluatorFunction(finalOperatorExpression.fallback, config),
      operator,
      error: error as Error,
      expression: finalOperatorExpression,
      returnErrorAsString,
    })
  }

  const outputType = finalOperatorExpression?.outputType ?? finalOperatorExpression?.type
  if (!outputType) return result

  const evaluatedOutputType = (await evaluatorFunction(outputType, config)) as OutputType

  // Output type conversion
  if (!(evaluatedOutputType in convertOutputMethods))
    return fallbackOrError({
      fallback: await evaluatorFunction(fallback, config),
      operator,
      error: `- Invalid output type: ${evaluatedOutputType}`,
      expression: finalOperatorExpression,
      returnErrorAsString,
    })
  else {
    return convertOutputMethods[evaluatedOutputType](result)
  }
}

// Evaluate all child/property nodes simultaneously
export const evaluateArray = async (
  nodes: EvaluatorNode[] | EvaluatorNode,
  params: FigTreeConfig
): Promise<EvaluatorOutput[]> => {
  if (!Array.isArray(nodes)) return (await evaluatorFunction(nodes, params)) as EvaluatorOutput[]
  return await Promise.all(nodes.map((node) => evaluatorFunction(node, params)))
}

/*
Identify any properties in the expression that represent "alias" nodes (i.e of
the form `$alias`) and evaluate their values
*/
export const evaluateNodeAliases = async (expression: OperatorNode, config: FigTreeConfig) => {
  const aliasKeys = Object.keys(expression).filter(isAliasString)
  if (aliasKeys.length === 0) return {}

  const evaluations: Promise<EvaluatorOutput>[] = []
  aliasKeys.forEach((alias) => evaluations.push(evaluatorFunction(expression[alias], config)))
  const results = await Promise.all(evaluations)
  const returnObject = zipArraysToObject(aliasKeys, await Promise.all(evaluations))

  // This is for the case when an alias references another alias at the same
  // level
  for (const [index, result] of results.entries()) {
    if (typeof result === 'string' && isAliasString(result))
      returnObject[aliasKeys[index]] = returnObject?.[result] ?? result
  }

  return returnObject
}

/*
Check if an object has any "Operator Nodes" as values and evaluate them if so.
Doesn't need to be recursive or handle arrays, as the main "evaluatorFunction"
will handle that.
*/

export const evaluateObject = async (
  input: EvaluatorNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const functionNames = Object.keys(config.options?.functions ?? {})
  const fullNode = preProcessShorthand(input, config.options?.fragments, functionNames)

  if (!isObject(fullNode)) return input

  const newObjectEntries: unknown[] = []
  const newAliases: unknown[] = []

  // First evaluate any Alias nodes we find and add them to config
  Object.entries(fullNode).forEach(([key, value]) => {
    if (isAliasString(key)) {
      newAliases.push(key, evaluatorFunction(value, config))
      delete (fullNode as Record<string, unknown>)[key]
    }
  })
  const aliasArray = await Promise.all(newAliases)
  config.resolvedAliasNodes = { ...config.resolvedAliasNodes, ...singleArrayToObject(aliasArray) }

  // Then evaluate the rest
  Object.entries(fullNode).forEach(([key, value]) => {
    newObjectEntries.push(key, evaluatorFunction(value, config))
  })

  const results = await Promise.all(newObjectEntries)

  return replaceAliasNodeValues(singleArrayToObject(results), config)
}
