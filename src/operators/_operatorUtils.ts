/*
Functions used specifically by various operators
*/

import axios from 'axios'
import extractProperty from 'object-property-extractor/build/extract'
import { evaluatorFunction } from '../evaluate'
import { typeCheck, TypeCheckInput, BasicType, isLiteralType, LiteralType } from '../typeCheck'
import { GenericObject, EvaluatorNode, EvaluatorOutput, FigTreeConfig, Parameter } from '../types'

// Generate property data for each operator from "operatorData.parameters"
export const getRequiredProperties = (parameters: Parameter[]): string[] =>
  parameters.filter((p) => p.required).map((p) => p.name)

export const getPropertyAliases = (parameters: Parameter[]): Record<string, string> => {
  const propertyAliases: Record<string, string> = {}
  parameters.forEach((param) => {
    param.aliases.forEach((alias) => (propertyAliases[alias] = param.name))
  })
  return propertyAliases
}

export const getTypeCheckInput = (
  parameterDefinitions: Parameter[],
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
    return { name, value: params[name], expectedType } as TypeCheckInput
  })

// Evaluate all child/property nodes simultaneously
export const evaluateArray = async (
  nodes: EvaluatorNode[],
  params: FigTreeConfig
): Promise<EvaluatorOutput[]> => {
  if (!Array.isArray(nodes)) return (await evaluatorFunction(nodes, params)) as EvaluatorNode[]
  return await Promise.all(nodes.map((node) => evaluatorFunction(node, params)))
}

/*
"Zips" two arrays into an object, where the first array provides 
the keys, and the second becomes the values
e.g. (["one", "two"], [1, 2]) => {one: 1, two: 2}
*/
export const zipArraysToObject = <T>(
  keys: string[],
  values: T[]
): { [K in typeof keys[number]]: T } => {
  const pairs = keys.map((key, index) => [key, values[index]])
  return Object.fromEntries(pairs)
}

/*
Interleaves a single array into an object, where items 0, 2, 4... become the
keys and items 1, 3, 5... become the values.
E.g. [ "one", 100, "two": "a value", "three", true ]
  => { one: 100, two: "a value", 3: true }
*/
export const singleArrayToObject = (elements: any[]) => {
  if (elements.length % 2 !== 0)
    throw new Error('Even number of children required to make key/value pairs')

  const keys = elements.filter((_, index) => index % 2 === 0)
  const result = typeCheck(
    ...keys.map((key) => ({
      value: key,
      expectedType: ['string', 'number', 'boolean'] as BasicType[],
    }))
  )
  if (result !== true) throw new Error(result)

  const values = elements.filter((_, index) => index % 2 === 1)

  const output: any = {}
  keys.forEach((key, index) => {
    output[key] = values[index]
  })

  return output
}

/*
If object only has one property, just return the value of that property
rather than the whole object
*/
export const simplifyObject = (item: number | string | boolean | GenericObject) => {
  return item instanceof Object && Object.keys(item).length === 1 ? Object.values(item)[0] : item
}

/*
Extracts a (nested) property from Object and simplifies output as above
*/
export const extractAndSimplify = (
  data: GenericObject | GenericObject[],
  returnProperty: string | undefined,
  fallback: any = undefined
) => {
  try {
    const selectedProperty = returnProperty ? extractProperty(data, returnProperty, fallback) : data
    if (Array.isArray(selectedProperty)) return selectedProperty.map((item) => simplifyObject(item))
    if (returnProperty) {
      if (selectedProperty === null) return null // GraphQL field can return null as valid result
      return simplifyObject(selectedProperty)
    }
    return selectedProperty
  } catch (err) {
    throw err
  }
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

export const axiosRequest = async ({
  url,
  params = {},
  data = {},
  headers = {},
  method = 'get',
}: {
  url: string
  params?: GenericObject
  data?: GenericObject
  headers?: GenericObject
  method?: 'get' | 'post'
}) => {
  try {
    const response = await axios({
      method,
      url,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      params,
      data,
    })
    return response.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (!err?.response) throw new Error('Network Error')
      console.log(err.response?.data)
    }
    throw err
  }
}
