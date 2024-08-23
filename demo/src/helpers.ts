import { evaluatorConfig } from './data/evaluatorConfig'

export const getInitOptions = () => {
  const savedOptions = parseLocalStorage('options') ?? {}
  const graphQLConnection = savedOptions.graphQLConnection ?? undefined
  const baseEndpoint = savedOptions.baseEndpoint ?? undefined
  const headers = savedOptions.headers ?? undefined
  const skipRuntimeTypeCheck = savedOptions.skipRuntimeTypeCheck ?? undefined
  const evaluateFullObject = savedOptions.evaluateFullObject ?? undefined
  const fragments = savedOptions.fragments ?? evaluatorConfig.fragments
  const useCache = savedOptions.useCache ?? true
  const maxCacheSize = savedOptions.maxCacheSize ?? 50
  const maxCacheTime = savedOptions.maxCacheTime ?? 1800
  const functions = evaluatorConfig.customFunctions
  return {
    graphQLConnection,
    baseEndpoint,
    headers,
    skipRuntimeTypeCheck,
    evaluateFullObject,
    fragments,
    functions,
    useCache,
    maxCacheSize,
    maxCacheTime,
  }
}

export const getInitCache = () => parseLocalStorage('cache') ?? null

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
        if (val instanceof Object && !Array.isArray(val)) return [key, convertTypes(val)]
        return [key, val]
      })
    )
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return key === 'options' ? parsed : convertTypes(parsed)
  } catch {
    return null
  }
}

// Given an object, returns a new object with all keys removed whose values
// return false when passed into the 2nd parameter function. Can be use (for
// example) to remove keys with null or undefined values (the default)
// Eg. {one: 1, two: null, three: undefined} => {one: 1}
// Filters recursively, and any objects or arrays which end up empty have their key removed too.
type FilterFunction = (x: any) => boolean
export const filterObjectRecursive = (
  inputObj: object,
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

export const getLocalStorage = (key: string) => {
  const value = localStorage.getItem(key)
  if (value) return JSON.parse(value)
  return null
}

export const setLocalStorage = (key: string, value: object | string | number) => {
  localStorage.setItem(key, JSON.stringify(value))
}
