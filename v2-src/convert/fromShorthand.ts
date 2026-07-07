/**
 * Convert a FigTree expression from "Shorthand" syntax to "Full" syntax
 */

import { FigTreeEvaluator } from '../FigTreeEvaluator'
import { isFragmentNode, isObject, isOperatorNode, standardiseOperatorName } from '../helpers'
import { EvaluatorNode, FragmentNode, OperatorMetadata } from '../types'

export const convertFromShorthand = (
  expression: EvaluatorNode,
  figTree: FigTreeEvaluator
): EvaluatorNode => {
  const operators = figTree.getOperators()
  const fragments = figTree.getFragments()
  const functions = figTree.getCustomFunctions()

  const allFragments = fragments.map((f) => f.name)
  const allFunctions = functions.map((f) => f.name)

  const fromShorthand = (expression: EvaluatorNode): EvaluatorNode => {
    if (Array.isArray(expression)) return expression.map((node) => fromShorthand(node))

    if (!isObject(expression)) return expression

    const properties = Object.entries(expression)

    if (properties.length === 0) return expression

    const objectKey = properties[0][0].replace('$', '')

    const operatorAlias = standardiseOperatorName(objectKey)

    const operatorData = operators.find(
      (op) => op.name === operatorAlias || op.aliases.includes(operatorAlias)
    )
    const isFragment = allFragments.includes(objectKey)
    const isFunction = allFunctions.includes(objectKey)

    if (operatorData) {
      const operator = operatorData.aliases[0]
      const value = properties[0][1]
      if (Array.isArray(value)) {
        const children = value.map((el) => fromShorthand(el))
        const parsed = operatorData.parseChildren({ operator, children }, figTree.getConfig())
        delete parsed.children
        return { ...parsed, ...getAdditionalProperties(properties) }
      }

      const fullValue = fromShorthand(value)
      if (
        !isObject(fullValue) ||
        !hasOperatorProperties(fullValue, operatorData) ||
        isOperatorNode(fullValue) ||
        isFragmentNode(fullValue)
      ) {
        const firstParam = operatorData.parameters[0].name
        return { operator, [firstParam]: fullValue }
      }
      return { operator, ...fullValue, ...getAdditionalProperties(properties) }
    }

    if (isFragment) {
      const fragmentProperties = fromShorthand((expression as FragmentNode)[properties[0][0]])
      if (!isObject(fragmentProperties)) throw new Error('Invalid shorthand Fragment')
      return {
        fragment: objectKey,
        ...fragmentProperties,
        ...getAdditionalProperties(properties),
      }
    }

    if (isFunction) {
      const operator = objectKey
      const value = properties[0][1]

      const fullValue = fromShorthand(value)
      if (!isObject(fullValue) || isOperatorNode(fullValue) || isFragmentNode(fullValue)) {
        const firstParam = 'args'
        return { operator, [firstParam]: fullValue }
      }
      return { operator, ...fullValue, ...getAdditionalProperties(properties) }
    }

    // Not a shorthand node, just process the children
    return Object.fromEntries(properties.map(([key, value]) => [key, fromShorthand(value)]))
  }

  const getAdditionalProperties = (properties: [key: string, value: EvaluatorNode][]) => {
    const otherProperties = properties.slice(1)
    const otherPropertyObject = Object.fromEntries(
      otherProperties.map(([key, value]) => [key, fromShorthand(value)])
    )
    return otherPropertyObject
  }

  return fromShorthand(expression)
}

const hasOperatorProperties = (input: object, operatorData: OperatorMetadata) => {
  const possibleProperties = operatorData.parameters
    .map((param) => [param.name, ...param.aliases])
    .flat()

  const presentProperties = Object.keys(input)

  return presentProperties.some((prop) => possibleProperties.includes(prop))
}
