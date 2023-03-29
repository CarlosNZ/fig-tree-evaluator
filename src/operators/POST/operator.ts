import {
  evaluateArray,
  axiosRequest,
  extractAndSimplify,
  isFullUrl,
  joinUrlParts,
  getTypeCheckInput,
} from '../_operatorUtils'
import { EvaluatorOutput, FigTreeConfig, GenericObject, OperatorObject } from '../../types'
import { parseChildrenGET as parseChildren, APINode } from '../GET/operator'
import operatorData, { propertyAliases } from './data'

const evaluate = async (expression: APINode, config: FigTreeConfig): Promise<EvaluatorOutput> => {
  const [urlObj, data, returnProperty, headers] = (await evaluateArray(
    [expression.url, expression.parameters, expression.returnProperty, expression.headers],
    config
  )) as [string | { url: string; headers: GenericObject }, GenericObject, string, GenericObject]

  const { url, headers: headersObj } =
    urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  config.typeChecker([
    ...getTypeCheckInput(operatorData.parameters, { url, headers, data, returnProperty }),
    { name: 'headers', value: headersObj, expectedType: ['object', 'null'] },
  ])

  const baseUrl = config.options.baseEndpoint ?? ''

  const httpHeaders = { ...config.options?.headers, ...headersObj, ...headers }

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? true

  const result = await config.cache.useCache(
    shouldUseCache,
    async (url: string, data: GenericObject, headers: GenericObject, returnProperty?: string) => {
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
