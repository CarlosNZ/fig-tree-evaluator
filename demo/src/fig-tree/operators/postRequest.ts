import {
  evaluateArray,
  axiosRequest,
  extractAndSimplify,
  isFullUrl,
  joinUrlParts,
} from './_operatorUtils'
import { EvaluatorOutput, FigTreeConfig, GenericObject, OperatorObject } from '../types'
import { parseChildrenGET as parseChildren, APINode } from './getRequest'

const requiredProperties = ['url'] as const
const operatorAliases = ['post']
const propertyAliases = { endpoint: 'url', outputProperty: 'returnProperty' }

const evaluate = async (expression: APINode, config: FigTreeConfig): Promise<EvaluatorOutput> => {
  const [urlObj, data, returnProperty, headers] = (await evaluateArray(
    [expression.url, expression.parameters, expression.returnProperty, expression.headers],
    config
  )) as [string | { url: string; headers: GenericObject }, GenericObject, string, GenericObject]

  const { url, headers: headersObj } =
    urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  config.typeChecker(
    { name: 'url', value: url, expectedType: 'string' },
    { name: 'headers', value: headersObj, expectedType: ['object', 'null'] },
    { name: 'data', value: data, expectedType: ['object', 'undefined'] },
    { name: 'returnProperty', value: returnProperty, expectedType: ['string', 'undefined'] }
  )

  const baseUrl = config.options.baseEndpoint ?? ''

  const httpHeaders = { ...config.options?.headers, ...headersObj, ...headers }
  const response = await axiosRequest({
    url: isFullUrl(url) ? url : joinUrlParts(baseUrl, url),
    data,
    headers: httpHeaders,
    method: 'post',
  })
  return extractAndSimplify(response, returnProperty)
}

export const POST: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
