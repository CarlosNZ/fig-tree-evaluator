import { AxiosRequestHeaders } from 'axios'
import { evaluateArray } from '../../evaluate'
import {
  zipArraysToObject,
  axiosRequest,
  extractAndSimplify,
  isFullUrl,
  joinUrlParts,
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

const evaluate: EvaluateMethod = async (expression, config) => {
  const [urlObj, parameters, returnProperty, headers, useCache] = (await evaluateArray(
    [
      expression.url,
      expression.parameters,
      expression.returnProperty,
      expression.headers,
      expression.useCache,
    ],
    config
  )) as [
    string | { url: string; headers: AxiosRequestHeaders },
    { [key: string]: string },
    string,
    AxiosRequestHeaders,
    boolean
  ]

  const { url, headers: headersObj } =
    urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  config.typeChecker([
    ...getTypeCheckInput(operatorData.parameters, {
      url,
      returnProperty,
      headers,
      parameters,
      useCache,
    }),
    {
      name: 'headers',
      value: headersObj,
      expectedType: ['object', 'null'],
    },
  ])

  const baseUrl = config.options.baseEndpoint ?? ''

  const httpHeaders = { ...config.options?.headers, ...headersObj, ...headers }

  const shouldUseCache = useCache ?? config.options.useCache ?? true

  const result = await config.cache.useCache(
    shouldUseCache,
    async (
      url: string,
      params: { [key: string]: string },
      headers: AxiosRequestHeaders,
      returnProperty?: string
    ) => {
      const response = await axiosRequest({
        url,
        params,
        headers,
      })
      return extractAndSimplify(response, returnProperty)
    },
    isFullUrl(url) ? url : joinUrlParts(baseUrl, url),
    parameters,
    httpHeaders,
    returnProperty
  )

  return result
}

const parseChildren: ParseChildrenMethod = async (expression, config) => {
  const [url = '', fieldNames, ...rest] = (await evaluateArray(
    expression.children as EvaluatorNode[],
    config
  )) as [string, string[]]
  const fieldKeys = Array.isArray(fieldNames) ? fieldNames : [fieldNames]
  const values = rest.slice(0, fieldKeys.length)
  const parameters = zipArraysToObject(fieldKeys, values)
  const output: OperatorNode = { ...expression, url, parameters }
  if (rest.length > fieldKeys.length) output.returnProperty = rest.pop()
  return output
}

// For name clash with logicalAnd export
export const parseChildrenGET = parseChildren

export const GET: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
