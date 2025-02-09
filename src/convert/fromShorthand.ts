/**
 * Convert a FigTree expression from "Shorthand" syntax to "Full" syntax
 */

import { FigTreeEvaluator } from '../FigTreeEvaluator'
import { isAliasString, isObject, standardiseOperatorName } from '../helpers'
import { EvaluatorNode, FragmentNode } from '../types'

export const convertFromShorthand = async (
  expression: EvaluatorNode,
  figTree: FigTreeEvaluator
): Promise<EvaluatorNode> => {
  const operators = figTree.getOperators()
  const fragments = figTree.getFragments()
  const functions = figTree.getCustomFunctions()

  const allFragments = fragments.map((f) => f.name)
  const allFunctions = functions.map((f) => f.name)

  const fromShorthand = async (expression: EvaluatorNode): Promise<EvaluatorNode> => {
    if (Array.isArray(expression))
      return await Promise.all(expression.map((node) => fromShorthand(node)))

    if (!isObject(expression)) return expression

    const properties = Object.entries(expression)

    if (properties.length === 0) return expression

    const operatorAlias = standardiseOperatorName(properties[0][0].replace('$', ''))

    const operatorData = operators.find(
      (op) => op.name === operatorAlias || op.aliases.includes(operatorAlias)
    )
    if (operatorData) {
      const operator = operatorData.aliases[0]
      const value = properties[0][1]
      if (Array.isArray(value)) {
        const children = await Promise.all(value.map((el) => fromShorthand(el)))
        const parsed = await operatorData.parseChildren({ operator, children }, figTree.getConfig())
        delete parsed.children
        return { ...parsed, ...(await getAdditionalProperties(properties)) }
      }

      const fullValue = await fromShorthand(value)
      if (!isObject(fullValue)) {
        const firstParam = operatorData.parameters[0].name
        return { operator, [firstParam]: fullValue }
      }
      return { operator, ...fullValue, ...(await getAdditionalProperties(properties)) }
    }

    if (allFragments.includes(operatorAlias)) {
      const fragmentProperties = await fromShorthand((expression as FragmentNode)[properties[0][0]])
      if (!isObject(fragmentProperties)) throw new Error('Invalid shorthand Fragment')
      return {
        fragment: operatorAlias,
        ...fragmentProperties,
        ...(await getAdditionalProperties(properties)),
      }
    }

    if (allFunctions.includes(operatorAlias)) {
      //
    }

    // Not a shorthand node, just process the children
    return Object.fromEntries(
      await Promise.all(properties.map(async ([key, value]) => [key, await fromShorthand(value)]))
    )

    return expression

    // Get key
    // - convert to preferred operator name

    // Handle property
    // - if single val, use first parameter
    // - if array, parse children
    // - otherwise map properties

    //
  }

  const getAdditionalProperties = async (properties: [key: string, value: EvaluatorNode][]) => {
    const otherProperties = properties.slice(1)
    const otherPropertyObject = Object.fromEntries(
      await Promise.all(
        otherProperties.map(async ([key, value]) => [key, await fromShorthand(value)])
      )
    )
    return otherPropertyObject
  }

  return fromShorthand(expression)
}
