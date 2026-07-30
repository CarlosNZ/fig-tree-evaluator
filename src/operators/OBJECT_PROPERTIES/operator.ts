import extractProperty from 'object-property-extractor'
import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

// object-property-extractor re-parses the path string on every call; cache it
// since the same path is typically evaluated repeatedly on a given node.
// Mirrors that library's (unexported) internal split logic.
const PATH_CACHE_LIMIT = 2000
const propertyPathCache = new Map<string, (string | number)[]>()

const splitPropertyPath = (path: string): (string | number)[] =>
  path.split(/(\.|\[\d+\])/).reduce((segments, segment) => {
    if (segment === '.' || segment === '') return segments
    const arrayIndexMatch = /\[(\d+)\]/.exec(segment)
    segments.push(arrayIndexMatch ? Number(arrayIndexMatch[1]) : segment)
    return segments
  }, [] as (string | number)[])

const getSplitPropertyPath = (path: string): (string | number)[] => {
  const cached = propertyPathCache.get(path)
  if (cached) return cached
  const split = splitPropertyPath(path)
  if (propertyPathCache.size >= PATH_CACHE_LIMIT) propertyPathCache.clear()
  propertyPathCache.set(path, split)
  return split
}

// object-property-extractor's own throw builds a JSON.stringify'd error
// message that's wasted whenever a fallback is set, since fallbackOrError
// discards it once the fallback resolves. Use this sentinel to skip that cost
// in the fallback case; without a fallback, the detailed message is kept.
const NOT_FOUND = Symbol('objectPropertiesNotFound')

const evaluate: EvaluateMethod = async (expression, config) => {
  const [property, additionalData = {}] = (await evaluateArray(
    [expression.property, expression.additionalData],
    config
  )) as [string, object]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { property, additionalData }))

  const inputObject = { ...(config.options?.data ?? {}), ...additionalData }
  const path = typeof property === 'string' ? getSplitPropertyPath(property) : property

  if (expression.fallback !== undefined) {
    const result = extractProperty(inputObject, path, NOT_FOUND)
    if (result !== NOT_FOUND) return result
    throw new Error(`Unable to extract object property\nLooking for property: ${property}`)
  }

  return extractProperty(inputObject, path)
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [property, fallback] = expression.children as EvaluatorNode[]
  const returnValue = { ...expression, property }
  if (fallback !== undefined) returnValue.fallback = fallback
  return returnValue
}

export const OBJECT_PROPERTIES: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
