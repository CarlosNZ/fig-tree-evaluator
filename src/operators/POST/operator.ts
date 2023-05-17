import { AxiosRequestHeaders } from 'axios'
import {
  axiosRequest,
  extractAndSimplify,
  isFullUrl,
  joinUrlParts,
  getTypeCheckInput,
} from '../_operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluateMethod, OperatorObject } from '../../types'
import { parseChildrenGET as parseChildren } from '../GET/operator'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [urlObj, data, returnProperty, headers, useCache] = (await evaluateArray(
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
    object,
    string,
    AxiosRequestHeaders,
    boolean
  ]

  const { url, headers: headersObj } =
    urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  config.typeChecker([
    ...getTypeCheckInput(operatorData.parameters, { url, headers, data, returnProperty, useCache }),
    { name: 'headers', value: headersObj, expectedType: ['object', 'null'] },
  ])

  const baseUrl = config.options.baseEndpoint ?? ''

  const httpHeaders = { ...config.options?.headers, ...headersObj, ...headers }

  const shouldUseCache = useCache ?? config.options.useCache ?? true

  const result = await config.cache.useCache(
    shouldUseCache,
    async () => {
      const response = await axiosRequest({
        url,
        data,
        headers,
        method: 'post',
      })
      return extractAndSimplify(response, returnProperty)
    },
    isFullUrl(url) ? url : joinUrlParts(baseUrl, url),
    data,
    httpHeaders,
    returnProperty
  )

  return result
}

export const POST: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
