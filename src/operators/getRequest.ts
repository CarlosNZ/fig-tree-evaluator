import {
  allPropsOk,
  zipArraysToObject,
  assignChildNodesToQuery,
  extractAndSimplify,
  fetchAPIrequest,
} from './helpers'
import { BaseOperatorNode, EvaluatorNode, ValueNode, OperationInput } from '../types'

export interface APINode extends BaseOperatorNode {
  url?: EvaluatorNode
  parameters?: EvaluatorNode
  returnProperty?: EvaluatorNode
}

const parse = async (expression: APINode): Promise<EvaluatorNode[]> => {
  const { url, parameters = {}, returnProperty } = expression
  allPropsOk(['url'], expression)

  const children = [url, Object.keys(parameters as object), ...Object.values(parameters as object)]
  if (returnProperty) children.push(returnProperty)
  return children
}

const operate = async (inputObject: OperationInput): Promise<ValueNode> =>
  await processAPIquery(inputObject)

export const processAPIquery = async (
  { children, options }: OperationInput,
  isPostRequest = false
) => {
  {
    const APIfetch = options?.APIfetch
    if (!APIfetch) throw new Error('No Fetch method provided for API query')
    let urlWithQuery, returnedProperty, requestBody, headers
    try {
      const {
        url,
        headers: queryHeaders,
        fieldNames,
        values,
        returnProperty,
      } = assignChildNodesToQuery([
        '', // Extra unused field for GET/POST (query)
        ...children,
      ])
      headers = queryHeaders ?? options?.headers
      returnedProperty = returnProperty
      urlWithQuery =
        fieldNames.length > 0 && !isPostRequest
          ? `${url}?${fieldNames
              .map((field: string, index: number) => field + '=' + values[index])
              .join('&')}`
          : url
      requestBody = isPostRequest ? zipArraysToObject(fieldNames, values) : null
    } catch {
      throw new Error('Invalid API query')
    }
    let data
    try {
      data = isPostRequest
        ? await fetchAPIrequest({
            url: urlWithQuery,
            APIfetch,
            method: 'POST',
            body: requestBody,
            headers,
          })
        : await fetchAPIrequest({ url: urlWithQuery, APIfetch, headers })
    } catch (err) {
      throw err
    }
    return extractAndSimplify(data, returnedProperty)
  }
}

export const getRequest = { parse, operate }
