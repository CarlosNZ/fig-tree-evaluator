import {
  EvaluatorNode,
  FragmentMetadata,
  OperatorMetadata,
  isOperatorNode,
  isFragmentNode,
  isObject,
  isAliasString,
  OperatorNode,
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
  }
) => {
  if (Array.isArray(expression))
    return expression.map((value) => validateExpression(value, figTreeMetaData))

  if (!isObject(expression)) return expression

  const isOperator = isOperatorNode(expression)
  const isFragment = isFragmentNode(expression)

  const currentMetaData = isOperator
    ? getCurrentOperator(expression, figTreeMetaData.operators)
    : isFragment
    ? figTreeMetaData.fragments.find((frag) => frag.name === expression.fragment)
    : undefined

  const requiredProperties = currentMetaData?.parameters
    ? currentMetaData.parameters.filter((param) => param.required)
    : []
  const allPropertyAliases = currentMetaData?.parameters
    ? isOperator
      ? currentMetaData.parameters.reduce(
          (acc: string[], curr) => [...acc, curr.name, ...curr.aliases],
          []
        )
      : currentMetaData.parameters.map((property) => property.name)
    : []

  const acceptArbitraryProperties = isOperator
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
    newExpression.push(
      ...requiredProperties
        .filter((prop) => !currentKeys.includes(prop.name))
        .map((prop) => [prop.name, prop.default ?? getDefaultValue(prop.type)])
    )
  }

  return {
    ...Object.fromEntries(newExpression),
    ...Object.fromEntries(commonPropertyEntries),
    ...Object.fromEntries(aliasEntries),
  }
}

// Strips operator node of all but the "common" properties -- used when
// switching node
export const cleanOperatorNode = (node: OperatorNode) =>
  Object.fromEntries(Object.entries(node).filter(([key, _]) => commonProperties.includes(key)))

// Returns a list of available properties for Operator or Fragment, excluding
// ones already in use
export const getAvailableProperties = (
  metaData: OperatorMetadata | FragmentMetadata,
  node: OperatorNode
) => {
  if (!metaData.parameters) return []
  const currentProperties = Object.keys(node)
  return metaData.parameters.filter((param) => !currentProperties.includes(param.name))
}
