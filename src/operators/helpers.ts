import extractProperty from 'object-property-extractor/build/extract'
import evaluateExpression from '../evaluateExpression'
import { isOperatorNode } from '../helpers'
import {
  BasicObject,
  BaseOperatorNode,
  OperatorNode,
  EvaluatorOptions,
  EvaluatorNode,
} from '../types'

export const allPropsOk = (props: string[], expression: BaseOperatorNode) => {
  const missingProps: string[] = []
  props.forEach((prop) => {
    if (!(prop in expression)) missingProps.push(prop)
  })
  if (missingProps.length > 0) throw new Error(`Missing properties: ${missingProps}`)
  else return true
}

// For edge case -- if parameters is an Operator node, we must evaluate it first
// or else it will be split up incorrectly
//  Only applicable if parameters is created from a "buildObject" operator
export const evaluateParameters = async (parameters: EvaluatorNode, options: EvaluatorOptions) => {
  const evaluatedParams = isOperatorNode(parameters)
    ? await evaluateExpression(parameters, options)
    : parameters
  if (!(evaluatedParams instanceof Object)) throw new Error('Invalid parameters object')
  return evaluatedParams
}

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
