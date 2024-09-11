import { evaluateArray, evaluateObject } from '../../evaluate'
import {
  zipArraysToObject,
  extractAndSimplify,
  isFullUrl,
  joinUrlParts,
  httpRequest,
  getTypeCheckInput,
  HttpClient,
} from '../operatorUtils'
import {
  OperatorNode,
  EvaluatorNode,
  OperatorObject,
  EvaluateMethod,
  ParseChildrenMethod,
} from '../../types'
import operatorData, { propertyAliases } from './data'
import { AxiosStatic } from 'axios'
import { Fetch } from '../../httpClients'

const evaluate: EvaluateMethod = async (expression, config) => {
  const client = config.graphQLClient ?? config.httpClient
  if (!client) throw new Error('No HTTP client provided for GraphQL connection')

  const [query, urlObj, variables, returnNode, headers, useCache] = (await evaluateArray(
    [
      expression.query,
      expression.url,
      await evaluateObject(expression.variables, config),
      expression.returnNode,
      expression.headers,
      expression.useCache,
    ],
    config
  )) as [
    string,
    string | { url: string; headers: Record<string, unknown> },
    object,
    string,
    Record<string, unknown>,
    boolean,
  ]

  const { url, headers: headersObj } =
    urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  config.typeChecker([
    ...getTypeCheckInput(operatorData.parameters, {
      url,
      query,
      variables,
      returnNode,
      headers,
      useCache,
    }),
    { name: 'headers', value: headersObj, expectedType: ['object', 'null'] },
  ])

  const endpoint = !url || url.toLowerCase() === 'graphqlendpoint' ? '' : url

  const baseEndpoint =
    config.options.graphQLConnection?.endpoint ?? config.options.baseEndpoint ?? ''

  const fullUrl = isFullUrl(endpoint) ? endpoint : joinUrlParts(baseEndpoint, endpoint)

  const data = { query, variables }

  const shouldUseCache = useCache ?? config.options.useCache ?? true

  const result = await config.cache.useCache(
    shouldUseCache,
    async (
      url: string,
      data: Record<string, unknown>,
      headers: Record<string, unknown>,
      returnNode?: string
    ) => {
      const response = (await httpRequest(client, { url, method: 'post', data, headers })) as {
        data: unknown
      }
      return extractAndSimplify(response?.data, returnNode)
    },
    fullUrl,
    data,
    {
      ...config.options.graphQLConnection?.headers,
      ...config.options?.headers,
      ...headersObj,
      ...headers,
    },
    returnNode
  )

  return result
}

const parseChildren: ParseChildrenMethod = async (expression, config) => {
  const [query, url = '', fieldNames, ...rest] = (await evaluateArray(
    expression.children as EvaluatorNode[],
    config
  )) as [string, string, string[]]
  const fieldKeys = Array.isArray(fieldNames) ? fieldNames : [fieldNames]
  const values = rest.slice(0, fieldKeys.length)
  const variables = zipArraysToObject(fieldKeys, values)
  const output: OperatorNode = { ...expression, query, url, variables }
  if (rest.length > fieldKeys.length) output.returnNode = rest.pop()
  return output
}

export interface GraphQLConnection {
  endpoint: string
  headers?: { [key: string]: string }
  httpClient?: HttpClient
}

export const GRAPHQL: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
