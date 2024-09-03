import { CustomFunctionMetadata } from 'fig-tree-evaluator'
import {
  EvaluatorNode,
  FragmentMetadata,
  OperatorMetadata,
  isOperatorNode,
  isFragmentNode,
  isObject,
  isAliasString,
  OperatorNode,
  FragmentNode,
  OperatorParameterMetadata,
  FragmentParameterMetadata,
} from 'fig-tree-evaluator'
import { getCurrentOperator, getDefaultValue, operatorAcceptsArbitraryProperties } from './helpers'

export const commonProperties = ['fallback', 'outputType', 'type', 'useCache']

// Ensures that the current expression is valid:
// - Any properties that don't belong to an operator/fragment are removed
//   (except $alias nodes, and for operators that can take arbitrary properties)
// - Any required properties that are missing are added, with default values
export const validateExpression = (
  expression: EvaluatorNode,
  figTreeMetaData: {
    operators: readonly OperatorMetadata[]
    fragments: readonly FragmentMetadata[]
    functions: readonly CustomFunctionMetadata[]
  }
): EvaluatorNode => {
  if (Array.isArray(expression))
    return expression.map((value) => validateExpression(value, figTreeMetaData))

  if (!isObject(expression)) return expression

  const isOperator = isOperatorNode(expression)
  const isFragment = isFragmentNode(expression)
  const isFunctionOperator =
    isOperator &&
    figTreeMetaData.functions
      .map(({ name }) => name)
      .includes((expression as OperatorNode)?.operator)

  if (isFunctionOperator) return expression

  const currentMetaData = isOperator
    ? getCurrentOperator((expression as OperatorNode)?.operator, figTreeMetaData.operators)
    : isFragment
      ? figTreeMetaData.fragments.find((frag) => frag.name === expression.fragment)
      : undefined

  const requiredProperties = (
    currentMetaData?.parameters
      ? (
          currentMetaData.parameters as (OperatorParameterMetadata | FragmentParameterMetadata)[]
        ).filter((param) => param.required)
      : []
  ) as OperatorParameterMetadata[]
  const allPropertyAliases = currentMetaData?.parameters
    ? isOperator
      ? (currentMetaData as OperatorMetadata).parameters.reduce(
          (acc: string[], curr) => [...acc, curr.name, ...curr.aliases],
          []
        )
      : currentMetaData.parameters.map((property) => property.name)
    : []

  if (isOperator && allPropertyAliases.length === 0 && !isFunctionOperator)
    throw new Error('Invalid operator')

  const acceptArbitraryProperties =
    isOperator && currentMetaData?.parameters
      ? operatorAcceptsArbitraryProperties(currentMetaData as OperatorMetadata)
      : false

  const expressionEntries = Object.entries(expression)

  const newExpression: [string, unknown][] = []
  const aliasEntries: [string, unknown][] = []
  const commonPropertyEntries: [string, unknown][] = []

  // Any properties that aren't supposed to be there are not included in the
  // updated list
  for (const entry of expressionEntries) {
    const [key, value] = entry

    if (isOperatorNode(value) || isFragmentNode(value))
      entry[1] = validateExpression(value, figTreeMetaData)

    if (Array.isArray(value))
      entry[1] = value.map((item) => validateExpression(item, figTreeMetaData))

    if (!isOperator && !isFragment) {
      newExpression.push(entry)
      continue
    }

    if (['operator', 'fragment', 'children'].includes(key)) {
      newExpression.push(entry)
      continue
    }
    if (isAliasString(key)) {
      aliasEntries.push(entry)
      continue
    }

    if (commonProperties.includes(key)) {
      commonPropertyEntries.push(entry)
      continue
    }

    if (allPropertyAliases.includes(key) || acceptArbitraryProperties) newExpression.push(entry)
  }

  // Add any required properties that are missing
  const currentKeys = newExpression.map((el) => el[0])
  if (!('children' in expression)) {
    const missingRequired = requiredProperties.filter(
      (prop) =>
        !currentKeys.includes(prop.name) &&
        (prop.aliases ?? []).every((alias) => !currentKeys.includes(alias))
    )
    newExpression.push(
      ...missingRequired.map(
        (prop) => [prop.name, prop.default ?? getDefaultValue(prop.type)] as [string, unknown]
      )
    )
  }

  // We sort the property order, as JSON objects can get their key order messed
  // up when stored as binary in a database
  newExpression.sort(([prop1], [prop2]) => {
    if (prop1 === 'operator') return -1
    if (prop2 === 'operator') return 1

    const prop1Position = allPropertyAliases.findIndex((prop) => prop === prop1)
    const prop2Position = allPropertyAliases.findIndex((prop) => prop === prop2)
    return prop1Position - prop2Position
  })

  return {
    ...Object.fromEntries(newExpression),
    ...Object.fromEntries(commonPropertyEntries),
    ...Object.fromEntries(aliasEntries),
  }
}

// Strips operator node of all but the "common" properties -- used when
// switching node
export const cleanOperatorNode = (node: OperatorNode) =>
  Object.fromEntries(
    Object.entries(node).filter(([key, _]) => commonProperties.includes(key) || isAliasString(key))
  )

// To add to list of available properties (drop-down)
const commonPropertyDetails = [
  {
    name: 'fallback',
    description: 'Value to return if operator throws error',
    aliases: [],
    required: false,
    // type: 'string',
    default: null,
  },
  {
    name: 'outputType',
    description: 'Convert output to another data type',
    aliases: [],
    required: false,
    type: 'string',
    default: 'string',
  },
]

// Returns a list of available properties for Operator or Fragment, excluding
// ones already in use
export const getAvailableProperties = (
  parameters: { name: string }[],
  node: OperatorNode | FragmentNode
) => {
  const allProperties = [...parameters, ...commonPropertyDetails]
  const currentProperties = Object.keys(node)
  return allProperties.filter((param) => !currentProperties.includes(param.name))
}
