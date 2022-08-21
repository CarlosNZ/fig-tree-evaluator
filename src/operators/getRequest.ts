import {
  evaluateArray,
  zipArraysToObject,
  axiosRequest,
  extractAndSimplify,
  isFullUrl,
  joinUrlParts,
} from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  EvaluatorOutput,
  EvaluatorConfig,
  CombinedOperatorNode,
  GenericObject,
  OperatorObject,
} from '../types'

const requiredProperties = ['url'] as const
const operatorAliases = ['get', 'api']
const propertyAliases = { endpoint: 'url', outputProperty: 'returnProperty' }

export type APINode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & {
    parameters?: EvaluatorNode
    returnProperty?: EvaluatorNode
    headers?: GenericObject
  }

const evaluate = async (expression: APINode, config: EvaluatorConfig): Promise<EvaluatorOutput> => {
  const [urlObj, params, returnProperty, headers] = (await evaluateArray(
    [expression.url, expression.parameters, expression.returnProperty, expression.headers],
    config
  )) as [
    string | { url: string; headers: GenericObject },
    { [key: string]: string },
    string,
    GenericObject
  ]

  const { url, headers: headersObj } =
    urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  config.typeChecker(
    { name: 'url', value: url, expectedType: 'string' },
    { name: 'headers', value: headersObj, expectedType: ['object', 'null'] },
    { name: 'headers', value: headers, expectedType: ['object', 'undefined'] },
    { name: 'parameters', value: params, expectedType: ['object', 'undefined'] },
    { name: 'returnProperty', value: returnProperty, expectedType: ['string', 'undefined'] }
  )

  const baseUrl = config.options.baseEndpoint ?? ''

  const httpHeaders = { ...config.options?.headers, ...headersObj, ...headers }
  const response = await axiosRequest({
    url: isFullUrl(url) ? url : joinUrlParts(baseUrl, url),
    params,
    headers: httpHeaders,
  })
  return extractAndSimplify(response, returnProperty)
}

const parseChildren = async (
  expression: CombinedOperatorNode,
  config: EvaluatorConfig
): Promise<APINode> => {
  const [url = '', fieldNames, ...rest] = (await evaluateArray(
    expression.children as EvaluatorNode[],
    config
  )) as [string, string[]]
  const values = rest.slice(0, fieldNames.length)
  const parameters = zipArraysToObject(fieldNames, values)
  const output = { ...expression, url, parameters }
  if (rest.length > fieldNames.length) output.returnProperty = rest.pop()
  return output
}

// For name clash with logicalAnd export
export const parseChildrenGET = parseChildren

export const GET: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
