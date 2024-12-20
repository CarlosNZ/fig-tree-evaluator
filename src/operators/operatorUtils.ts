/*
Functions used specifically by various operators
*/

import extractProperty from 'object-property-extractor'
import { isObject } from '../helpers'
import { typeCheck, TypeCheckInput, isLiteralType } from '../typeCheck'
import { OperatorParameterMetadata } from '../types'

// Generate property data for each operator from "operatorData.parameters"
export const getPropertyAliases = (
  parameters: OperatorParameterMetadata[]
): Record<string, string> => {
  const propertyAliases: Record<string, string> = {}
  parameters.forEach((param) => {
    param.aliases.forEach((alias) => (propertyAliases[alias] = param.name))
  })
  return propertyAliases
}

export const getTypeCheckInput = (
  parameterDefinitions: OperatorParameterMetadata[],
  params: Record<string, unknown>
) =>
  parameterDefinitions.map(({ name, required, type }) => {
    if (isLiteralType(type)) {
      const literal = [...type.literal]
      if (!required) literal.push(undefined)
      return { name, value: params[name], expectedType: { literal } }
    }

    const allTypes = Array.isArray(type) ? type : [type]
    if (!required) allTypes.push('undefined')
    const expectedType = allTypes.length === 1 ? allTypes[0] : allTypes
    return { name, value: params[name], expectedType }
  })

/*
"Zips" two arrays into an object, where the first array provides 
the keys, and the second becomes the values
e.g. (["one", "two"], [1, 2]) => {one: 1, two: 2}
*/
export const zipArraysToObject = <T>(
  keys: string[],
  values: T[]
): { [K in (typeof keys)[number]]: T } => {
  const pairs = keys.map((key, index) => [key, values[index]])
  return Object.fromEntries(pairs)
}

/*
Interleaves a single array into an object, where items 0, 2, 4... become the
keys and items 1, 3, 5... become the values.
E.g. [ "one", 100, "two": "a value", "three", true ]
  => { one: 100, two: "a value", 3: true }
*/
export const singleArrayToObject = <T>(elements: (unknown | T)[]) => {
  if (elements.length % 2 !== 0)
    throw new Error('Even number of children required to make key/value pairs')

  const keys = elements.filter((_, index) => index % 2 === 0)
  const result = typeCheck(
    ...keys.map(
      (key): TypeCheckInput => ({
        value: key,
        expectedType: ['string', 'number', 'boolean'],
      })
    )
  )
  if (result !== true) throw new Error(result)

  const values = elements.filter((_, index) => index % 2 === 1)

  const output: Record<string, T> = {}
  keys.forEach((key, index) => {
    output[key as string] = values[index] as T
  })

  return output
}

/*
If object only has one property, just return the value of that property
rather than the whole object
*/
export const simplifyObject = (item: unknown) => {
  return isObject(item) && Object.keys(item).length === 1 ? Object.values(item)[0] : item
}

/*
Extracts a (nested) property from Object and simplifies output as above
*/
export const extractAndSimplify = (
  data: unknown,
  returnProperty: string | undefined,
  fallback: unknown = undefined
) => {
  const selectedProperty = returnProperty ? extractProperty(data, returnProperty, fallback) : data
  if (Array.isArray(selectedProperty)) return selectedProperty.map((item) => simplifyObject(item))
  if (returnProperty) {
    if (selectedProperty === null) return null // GraphQL field can return null as valid result
    return simplifyObject(selectedProperty)
  }
  return selectedProperty
}

export const isFullUrl = (url: string) => /^https?:\/\/.+/.test(url)

export const joinUrlParts = (...urls: string[]) => {
  return urls.reduce((acc, curr, index) => {
    const startSliceIndex = curr[0] === '/' ? 1 : 0
    const endSliceIndex = curr.slice(-1) === '/' ? -1 : undefined
    const newPart = curr.slice(startSliceIndex, endSliceIndex)
    if (newPart === '') return acc
    return acc + (index === 0 ? '' : '/') + newPart
  }, '')
}

export interface HttpClient {
  get: (req: Omit<HttpRequest, 'method'>) => Promise<unknown>
  post: (req: Omit<HttpRequest, 'method'>) => Promise<unknown>
  throwError: (err: unknown) => void
}

export interface HttpRequest {
  url: string
  params?: { [key: string]: string }
  data?: Record<string, unknown>
  headers?: Record<string, unknown>
  method?: 'get' | 'post'
}

export const httpRequest = async (client: HttpClient, request: HttpRequest) => {
  const { url, params = {}, data = {}, headers = {}, method = 'get' } = request
  if (!url || url === '') throw new Error('Invalid url')
  try {
    const response = await client[method]({
      url,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      params,
      data,
    })
    return response
  } catch (err) {
    client.throwError(err)
  }
}
