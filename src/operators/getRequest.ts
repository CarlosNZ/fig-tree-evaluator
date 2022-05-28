import {
  evaluateArray,
  zipArraysToObject,
  extractAndSimplify,
  fetchAPIrequest,
} from './_operatorUtils'
import { errorMessage } from '../helpers'
import {
  BaseOperatorNode,
  EvaluatorNode,
  EvaluatorOutput,
  EvaluatorConfig,
  CombinedOperatorNode,
  GenericObject,
  EvaluatorOptions,
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
  }

const evaluate = async (expression: APINode, config: EvaluatorConfig): Promise<EvaluatorOutput> => {
  if (!config.options.APIfetch) throw new Error('No Fetch method provided for API query')

  const [urlObj, parameters, returnProperty] = (await evaluateArray(
    [expression.url, expression.parameters, expression.returnProperty],
    config
  )) as [string | { url: string; headers: GenericObject }, GenericObject, string]

  const { url, headers } = urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  const httpHeaders = { ...config.options?.headers, ...headers }
  return await processAPIquery({ url, parameters, returnProperty }, config.options, httpHeaders)
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

export const parseChildrenGET = parseChildren // For name clash with logicalAnd export

export const processAPIquery = async (
  {
    url,
    parameters = {},
    returnProperty,
  }: { url: string; parameters: GenericObject; returnProperty?: string },
  options: EvaluatorOptions,
  headers: GenericObject,
  isPostRequest = false
) => {
  const APIfetch = options.APIfetch
  const urlWithQuery =
    Object.keys(parameters).length > 0 && !isPostRequest
      ? `${url}?${Object.entries(parameters)
          .map(([key, val]) => key + '=' + val)
          .join('&')}`
      : url
  const requestBody = isPostRequest ? parameters : null

  let data
  try {
    data = isPostRequest
      ? await fetchAPIrequest({
          url,
          APIfetch,
          method: 'POST',
          body: requestBody,
          headers,
        })
      : await fetchAPIrequest({ url: urlWithQuery, APIfetch, headers })
  } catch (err) {
    throw new Error('Invalid API query: ' + errorMessage(err))
  }
  return extractAndSimplify(data, returnProperty)
}

export const GET: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
