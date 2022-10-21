import axios from 'axios'
import extractProperty from 'object-property-extractor/build/extract'
import { evaluatorFunction } from '../evaluate'
import { GenericObject, EvaluatorNode, EvaluatorOutput, FigTreeConfig } from '../types'

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
