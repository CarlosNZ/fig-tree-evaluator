/**
 * Convert a FigTree expression from "Full" syntax to "Shorthand" syntax
 *
 * In general, follows the following rule:
 * - When operator has only one property, it is placed as a primitive value,
 *   e.g. `{ $getData: "my.property" }`
 * - If operator has up to the "arrayThreshold" number of properties (default
 *   2), the value is an array, with the values positioned according to their
 *   position in the Operator parameter definitions, e.g. `{ $getData: [
 *   "my.property", "myFallback" ] }`
 * - More than that, they are placed as named properties in an object, e.g. `{
 *   $conditional: { condition: true, valueIfTrue: "YES", valueIfFalse: "NO" }}`
 *
 * There are some exceptions for specific operators, and Fragments are always
 * placed as named parameters.
 */

import { FigTreeEvaluator } from '../FigTreeEvaluator'
import { isAliasString, isObject, standardiseOperatorName } from '../helpers'
import {
  EvaluatorNode,
  FragmentNode,
  Fragments,
  OperatorAlias,
  OperatorMetadata,
  OperatorNode,
  OperatorParameterMetadata,
} from '../types'

export const convertToShorthand = (
  expression: EvaluatorNode,
  figTree: FigTreeEvaluator,
  arrayThreshold: number = 2
): EvaluatorNode => {
  const operators = figTree.getOperators()
  const fragments = figTree.getFragments()
  const functions = figTree.getCustomFunctions()
  const fragmentDefinitions = figTree.getOptions().fragments

  const allOpAliases = operators.map((op) => [op.name, ...op.aliases]).flat()
  const allFragments = fragments.map((f) => f.name)
  const allFunctions = functions.map((f) => f.name)

  const allReservedKeys = new Set([...allOpAliases, ...allFragments, ...allFunctions])

  const toShorthand = (expression: EvaluatorNode): EvaluatorNode => {
    if (Array.isArray(expression)) return expression.map((node) => toShorthand(node))

    if (!isObject(expression)) return expression

    const { operator, fragment, ...otherProperties } = expression as OperatorNode | FragmentNode

    if (!operator && !fragment)
      return Object.fromEntries(
        Object.entries(expression).map(([key, value]) => [key, toShorthand(value)])
      )

    // If the node uses the positional `children` array form, map it onto named
    // properties (via the operator's `parseChildren`) before converting —
    // otherwise `children` is carried through verbatim into the shorthand output.
    if (operator && Array.isArray((otherProperties as OperatorNode).children)) {
      const standardisedName = standardiseOperatorName(operator as string)
      const operatorData = operators.find(
        (op) => op.name === standardisedName || op.aliases.includes(standardisedName)
      )
      if (operatorData) {
        const parsed = operatorData.parseChildren(
          { ...otherProperties, operator } as OperatorNode,
          figTree.getConfig()
        )
        delete parsed.children
        return toShorthand(parsed)
      }
    }

    const isFunction = allFunctions.includes(operator as string)

    if (fragment && otherProperties?.parameters) {
      Object.entries(otherProperties.parameters).forEach(([key, value]) => {
        otherProperties[key] = value
      })
      delete otherProperties.parameters
    }

    const operatorReplacement = isFunction
      ? operator
      : getShorthandOperator(operator as string | undefined, operators)

    const nodeKey = `$${operatorReplacement ?? fragment}`

    const fragmentParameterKeys = fragment
      ? extractFragmentParameterKeys(fragment as string, fragmentDefinitions)
      : []

    const aliasDefinitionKeys = Object.keys(otherProperties).filter(
      (key) => isAlias(key, allReservedKeys) && !fragmentParameterKeys.includes(key)
    )

    const properties = Object.entries(otherProperties)
      .filter(([key]) => !aliasDefinitionKeys.includes(key) && !fragmentParameterKeys.includes(key))
      .map(([key, value]) => [key, toShorthand(value)])

    const aliasProperties = Object.fromEntries(
      aliasDefinitionKeys.map((key) => [key, toShorthand(otherProperties[key])])
    )

    const fragmentProperties = Object.fromEntries(
      fragmentParameterKeys.map((key) => [key, toShorthand(otherProperties[key])])
    )

    switch (true) {
      case Object.keys(fragmentProperties).length > 0: {
        return { [nodeKey]: fragmentProperties, ...aliasProperties }
      }
      case isFunction: {
        if (properties.length === 1 && !('input' in otherProperties))
          return { [nodeKey]: properties[0][1] }
        return { [nodeKey]: Object.fromEntries(properties), ...aliasProperties }
      }
      case usesArrayParameter(operator as string | undefined, otherProperties, operators): {
        if (properties.length === 1) return { [nodeKey]: properties[0][1] }
        return { [nodeKey]: Object.fromEntries(properties), ...aliasProperties }
      }
      case operatorReplacement === 'match': {
        return { [nodeKey]: Object.fromEntries(properties), ...aliasProperties }
      }
      case properties.length > arrayThreshold ||
        !!fragment ||
        properties.some(([key]) => key === 'useCache' || key === 'outputType') ||
        properties.some((prop) => Array.isArray(prop[1])): {
        return { [nodeKey]: Object.fromEntries(properties), ...aliasProperties }
      }
      case properties.length === 1: {
        return { [nodeKey]: properties[0][1], ...aliasProperties }
      }
      default:
        return {
          [nodeKey]: getPropertyStructure(
            standardiseOperatorName(operator as OperatorAlias),
            properties as Array<[key: string, value: unknown]>,
            operators
          ),
          ...aliasProperties,
        }
    }
  }

  return toShorthand(expression)
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
      if (additionalData) return Object.fromEntries(properties)
      const propertyName = findPropertyInParameters('property', properties, operatorData.parameters)
      if (!propertyName)
        throw new Error('Missing required property for operator $getData: property')
      const fallback = properties.find(([key]) => key === 'fallback')

      return fallback ? [propertyName[1], fallback[1]] : propertyName[1]
    }
    case 'GET':
    case 'POST':
    case 'GRAPHQL': {
      // These operators have a custom `parseChildren` (field-name/value zipping)
      // whose positional order doesn't match the parameter definitions, so the
      // positional-array shorthand can't represent them correctly. Always use
      // the named-object form, which bypasses `parseChildren` entirely.
      return Object.fromEntries(properties)
    }
    default: {
      const consumedKeys = new Set<string>()
      for (const { name, aliases, required } of operatorData.parameters) {
        const possibleNames = [name, ...aliases]

        const property = properties.find(([key]) => possibleNames.includes(key))
        if (property === undefined && required)
          throw new Error(`Missing required property for operator ${operator}: ${name}`)
        // Can't add more properties to array if one is missing
        if (property === undefined) break

        returnArray.push(property[1])
        consumedKeys.add(property[0])
      }

      // If any properties can't be represented in the positional array (e.g.
      // `fallback`, or parameters that follow a gap), use the named-object form
      // instead so they aren't silently dropped
      if (properties.some(([key]) => !consumedKeys.has(key))) return Object.fromEntries(properties)
    }
  }

  return returnArray
}

// True when the node uses the operator's primary (array-typed) parameter — e.g.
// `values` for AND/OR/+/=, or `properties` for buildObject (under any alias).
// These operators collapse to the bare-array shorthand `{ $op: [...] }` rather
// than the named-object form.
const usesArrayParameter = (
  operator: string | undefined,
  otherProperties: object,
  operators: readonly OperatorMetadata[]
) => {
  if (!operator) return false
  const standardisedName = standardiseOperatorName(operator)
  const firstParam = operators.find(
    (op) => op.name === standardisedName || op.aliases.includes(standardisedName)
  )?.parameters[0]
  if (!firstParam) return false
  const isArrayType =
    firstParam.type === 'array' ||
    (Array.isArray(firstParam.type) && firstParam.type.includes('array'))
  if (!isArrayType) return false
  return [firstParam.name, ...firstParam.aliases].some((key) => key in otherProperties)
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

const isAlias = (key: string, reservedKeys: Set<string>) =>
  isAliasString(key) && !reservedKeys.has(key)

const getShorthandOperator = (
  opAlias: string | undefined,
  operators: readonly OperatorMetadata[]
) => {
  if (!opAlias) return undefined

  const operator = operators.find(
    (op) => opAlias === op.name || op.aliases.includes(standardiseOperatorName(opAlias))
  )

  return operator?.aliases.find((alias) => /^[A-Za-z_]{2,}$/.test(alias))
}

// Currently, there's no way to tell which properties of a fragment node are
// parameters for the current fragment vs alias definitions, so it's hard to
// know which ones should be placed inside the Fragment shorthand object. For
// now, we'll have to do a regex search on the stringified Fragment definition
// to find them.
const extractFragmentParameterKeys = (fragmentName: string, fragments: Fragments = {}) => {
  const fragment = fragments[fragmentName]
  if (!fragment)
    throw new Error(
      'Fragment referenced in expression that is not defined in FigTree: ' + fragmentName
    )

  const fragmentAsString = JSON.stringify(fragment)
  const matches = fragmentAsString.match(/"(\$\w+)"/gm)
  if (!matches) return []
  const uniqueMatches = new Set<string>()
  matches.forEach((match) => uniqueMatches.add(match.replace(/"/g, '')))
  return Array.from(uniqueMatches)
}
