import { evaluateArray } from '../../evaluate'
import {
  zipArraysToObject,
  extractAndSimplify,
  isFullUrl,
  joinUrlParts,
  axiosRequest,
  getTypeCheckInput,
} from '../_operatorUtils'
import {
  OperatorNode,
  EvaluatorNode,
  OperatorObject,
  EvaluateMethod,
  ParseChildrenMethod,
} from '../../types'
import operatorData, { propertyAliases } from './data'
import { AxiosRequestHeaders } from 'axios'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [query, urlObj, variables, returnNode, headers, useCache] = (await evaluateArray(
    [
      expression.query,
      expression.url,
      expression.variables,
      expression.returnNode,
      expression.headers,
      expression.useCache,
    ],
    config
  )) as [
    string,
    string | { url: string; headers: AxiosRequestHeaders },
    object,
    string,
    AxiosRequestHeaders,
    boolean
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
    async (url: string, data: object, headers: AxiosRequestHeaders, returnNode?: string) => {
      const response = await axiosRequest({ url, method: 'post', data, headers })
      return extractAndSimplify(response.data, returnNode)
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
}

export const GRAPHQL: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
