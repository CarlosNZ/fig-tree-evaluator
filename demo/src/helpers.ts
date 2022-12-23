import { GenericObject } from './fig-tree-evaluator/src/types'

const looseJSON = require('loose-json')

export const getInitOptions = () => {
  const savedOptions = parseLocalStorage('options') ?? {}
  const graphQLConnection = savedOptions.graphQLConnection ?? undefined
  const baseEndpoint = savedOptions.baseEndpoint ?? undefined
  const headers = savedOptions.headers ?? undefined
  const skipRuntimeTypeCheck = savedOptions.skipRuntimeTypeCheck ?? undefined
  const evaluateFullObject = savedOptions.evaluateFullObject ?? undefined
  return {
    graphQLConnection,
    baseEndpoint,
    headers,
    skipRuntimeTypeCheck,
    evaluateFullObject,
  }
}

export const parseLocalStorage = (key: string | object) => {
  const value = typeof key === 'string' ? localStorage.getItem(key) : key
  if (!value) return null
  const convertTypes = (obj: { [key: string]: any }): any =>
    Object.fromEntries(
      Object.entries(obj).map(([key, val]) => {
        if (!isNaN(Number(val))) return [key, Number(val)]
        if (val === 'true') return [key, true]
        if (val === 'false') return [key, false]
        if (val === 'null') return [key, null]
        if (val === 'undefined') return [key, undefined]
        if (val instanceof Object) return [key, convertTypes(val)]
        return [key, val]
      })
    )
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return convertTypes(parsed)
  } catch {
    return null
  }
}

export const JSONstringify = (input: string, compact = false, strict = false) => {
  const indent = compact ? 0 : 2
  try {
    const backtickRe = /`[\s\S]*?`/g
    const backtickSubstitutions = input.match(backtickRe)
    const backtickReplacement = !compact ? input.replaceAll(backtickRe, `"@1234@"`) : input
    const inputObject = looseJSON(backtickReplacement)
    const stringified = strict
      ? JSON.stringify(inputObject, null, indent)
      : JSONstringifyLoose(inputObject, compact)
    let output = stringified
    if (backtickSubstitutions) {
      backtickSubstitutions.forEach((sub) => {
        output = output.replace(`"@1234@"`, sub)
      })
    }
    return output
  } catch {
    return false
  }
}

export const JSONstringifyLoose = (inputObject: object, compact = false) => {
  const objectString = compact ? JSON.stringify(inputObject) : JSON.stringify(inputObject, null, 2)
  const regex = /(")([^"]*?)("):/gm
  const replacementString = objectString.replaceAll(regex, '$2:')
  return replacementString
}

export const validateExpression = (input: string): boolean => {
  try {
    looseJSON(input)
    return true
  } catch {
    return false
  }
}

export const validateObjects = (objects: string): boolean => {
  try {
    const cleanObjectInput = looseJSON(objects)
    if (!Array.isArray(cleanObjectInput)) looseJSON(`${objects}`)
    return true
  } catch {
    return false
  }
}

// Given an object, returns a new object with all keys removed whose values
// return false when passed into the 2nd parameter function. Can be use (for
// example) to remove keys with null or undefined values (the default)
// Eg. {one: 1, two: null, three: undefined} => {one: 1}
// Filters recursively, and any objects or arrays which end up empty have their key removed too.
type FilterFunction = (x: any) => boolean
export const filterObjectRecursive = (
  inputObj: GenericObject,
  filterFunction: FilterFunction = (x) =>
    !(x == null || x === '' || (x instanceof Object && Object.keys(x).length === 0))
) => {
  const filtered: [key: string, value: any][] = Object.entries(inputObj)
    .map(([key, value]) => {
      if (Array.isArray(value))
        return [
          key,
          value
            .map((e) => (e instanceof Object ? filterObjectRecursive(e, filterFunction) : e))
            .filter((e) => !(e instanceof Object && Object.keys(e).length === 0)),
        ]
      if (value instanceof Object) {
        return [key, filterObjectRecursive(value, filterFunction)]
      } else return [key, value]
    })
    .filter(([_, value]) => filterFunction(value)) as [key: string, value: any][]
  return Object.fromEntries(filtered)
}
