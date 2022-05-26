import extractProperty from 'object-property-extractor/build/extract'
import { evaluatorFunction } from '../evaluate'
import { BasicObject, EvaluatorNode, ValueNode, EvaluatorConfig } from '../types'

// Evaluate all child nodes simultaneously
export const evaluateArray = async (
  nodes: EvaluatorNode[],
  params: EvaluatorConfig
): Promise<ValueNode[]> => {
  return await Promise.all(nodes.map((node) => evaluatorFunction(node, params)))
}

export const zipArraysToObject = (variableNames: string[], variableValues: any[]) => {
  const createdObject: BasicObject = {}
  variableNames.map((name, index) => {
    createdObject[name] = variableValues[index]
  })
  return createdObject
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
