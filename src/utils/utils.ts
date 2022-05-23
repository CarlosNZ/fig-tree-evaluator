import extractProperty from 'object-property-extractor/build/extract'
import { OperatorNode, OutputType, BasicObject, EvaluatorNode } from '../types'
import { camelCase } from 'lodash'

export const fallbackOrError = (
  fallback: any,
  errorMessage: string,
  returnErrorAsString: boolean
) => {
  if (fallback !== undefined) return fallback
  if (returnErrorAsString) return errorMessage
  else throw new Error(errorMessage)
}

export const convertOutputMethods: {
  [key in OutputType]: <T>(val: T) => number | string | boolean | T[]
} = {
  number: (value: any) => (Number.isNaN(Number(value)) ? value : Number(value)),
  string: (value: any) => String(value),
  array: (value: any) => (Array.isArray(value) ? value : [value]),
  boolean: (value: any) => Boolean(value),
  bool: (value: any) => Boolean(value),
}

export const parseIfJson = (input: EvaluatorNode) => {
  if (typeof input !== 'string') return input
  try {
    const parsed = JSON.parse(input)
    return parsed instanceof Object && 'operator' in parsed ? parsed : input
  } catch (err) {
    return input
  }
}

export const standardiseOperatorName = (name: string) => {
  const camelCaseName = camelCase(name)
  return camelCaseName ? camelCaseName : name
}

export const allPropsOk = (props: string[], expression: OperatorNode) => {
  const missingProps: string[] = []
  props.forEach((prop) => {
    if (!(prop in expression)) missingProps.push(prop)
  })
  if (missingProps.length > 0) throw new Error(`Missing properties: ${missingProps}`)
  else return true
}

// Workaround to prevent typescript errors for err.message
export const errorMessage = (err: unknown) => (err as Error).message

export const zipArraysToObject = (variableNames: string[], variableValues: any[]) => {
  const createdObject: BasicObject = {}
  variableNames.map((name, index) => {
    createdObject[name] = variableValues[index]
  })
  return createdObject
}

export const assignChildNodesToQuery = (childNodes: any[]) => {
  const skipFields = 3 // skip query, url and fieldNames
  const query: string = childNodes[0]
  let url: string
  let headers: { [key: string]: string } | null = null
  if (typeof childNodes[1] === 'object' && childNodes[1] !== null) {
    url = childNodes[1].url
    headers = childNodes[1].headers
  } else url = childNodes[1]
  const fieldNames: string[] = childNodes[2]

  const lastFieldIndex = fieldNames.length + skipFields
  const values: string[] = childNodes.slice(skipFields, lastFieldIndex)
  const returnProperty: string = childNodes[lastFieldIndex]

  return { url, headers, query, fieldNames, values, returnProperty }
}

export const simplifyObject = (item: number | string | boolean | BasicObject) => {
  return typeof item === 'object' && Object.keys(item).length === 1 ? Object.values(item)[0] : item
}

export const extractAndSimplify = (
  data: BasicObject | BasicObject[],
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

interface APIrequestProps {
  url: string
  APIfetch: any
  method?: 'GET' | 'POST'
  body?: { [key: string]: string } | null
  headers?: { [key: string]: string }
}

// GET/POST request using fetch (node or browser variety)
export const fetchAPIrequest = async ({
  url,
  APIfetch,
  method = 'GET',
  body,
  headers = {},
}: APIrequestProps) => {
  const result = await APIfetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
  return await result.json()
}
