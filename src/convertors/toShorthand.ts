/**
 * Convert a FigTree expression from "Full" syntax to "Shorthand" syntax
 */

import { FigTreeEvaluator } from '../FigTreeEvaluator'
import { isObject, standardiseOperatorName } from '../helpers'
import {
  EvaluatorNode,
  FragmentNode,
  OperatorAlias,
  OperatorMetadata,
  OperatorNode,
  OperatorParameterMetadata,
} from '../types'

export const convertToShorthand = (
  figTree: FigTreeEvaluator,
  expression: EvaluatorNode,
  arrayThreshold: number = 2
): EvaluatorNode => {
  if (Array.isArray(expression))
    return expression.map((node) => convertToShorthand(figTree, node, arrayThreshold))

  if (!isObject(expression)) return expression

  const { operator, fragment, ...otherProperties } = expression as OperatorNode | FragmentNode

  if (!operator && !fragment)
    return Object.fromEntries(
      Object.entries(expression).map(([key, value]) => [
        key,
        convertToShorthand(figTree, value, arrayThreshold),
      ])
    )

  const nodeKey = `$${operator ?? fragment}`

  const properties = Object.entries(otherProperties).map(([key, value]) => [
    key,
    convertToShorthand(figTree, value, arrayThreshold),
  ])

  switch (true) {
    case 'values' in otherProperties: {
      if (properties.length === 1) return { [nodeKey]: properties[0][1] }
      return { [nodeKey]: Object.fromEntries(properties) }
    }
    case properties.length > arrayThreshold ||
      !!fragment ||
      properties.some(([key]) => key === 'useCache' || key === 'outputType') ||
      properties.some((prop) => Array.isArray(prop[1])): {
      return { [nodeKey]: Object.fromEntries(properties) }
    }
    case properties.length === 1: {
      return { [nodeKey]: properties[0][1] }
    }
    default:
      return {
        [nodeKey]: getPropertyStructure(
          standardiseOperatorName(operator as OperatorAlias),
          properties as Array<[key: string, value: unknown]>,
          figTree.getOperators()
        ),
      }
  }
}

const getPropertyStructure = (
  operator: OperatorAlias,
  properties: Array<[key: string, value: unknown]>,
  operators: readonly OperatorMetadata[]
) => {
  const operatorData = operators.find((op) => op.name === operator || op.aliases.includes(operator))

  if (!operatorData) throw new Error('Invalid operator: ' + operator)

  const returnArray: unknown[] = []

  switch (operatorData.name) {
    case 'OBJECT_PROPERTIES': {
      const additionalData = findPropertyInParameters(
        'additionalData',
        properties,
        operatorData.parameters
      )
      if (additionalData) return Object.entries(properties)
      const propertyName = findPropertyInParameters('property', properties, operatorData.parameters)
      if (!propertyName)
        throw new Error('Missing required property for operator $getData: property')
      const fallback = properties.find(([key]) => key === 'fallback')

      return fallback ? [propertyName[1], fallback[1]] : propertyName[1]
    }
    case 'BUILD_OBJECT': {
      // TO-DO
      break
    }
    default: {
      for (const { name, aliases, required } of operatorData.parameters) {
        const possibleNames = [name, ...aliases]

        const property = properties.find(([key]) => possibleNames.includes(key))
        if (property === undefined && required)
          throw new Error(`Missing required property for operator ${operator}: ${name}`)
        // Can't add more properties to array if one is missing
        if (property === undefined) break

        returnArray.push(property[1])
      }
    }
  }

  return returnArray
}

const findPropertyInParameters = (
  property: string,
  properties: [key: string, value: unknown][],
  parameters: OperatorParameterMetadata[]
) => {
  const parameter = parameters.find((param) => param.name === property)
  if (!parameter) return undefined
  const possibleNames = [parameter.name, ...parameter.aliases]

  return properties.find(([key]) => possibleNames.includes(key))
}
