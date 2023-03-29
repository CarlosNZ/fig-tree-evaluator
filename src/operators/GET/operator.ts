import {
  evaluateArray,
  zipArraysToObject,
  axiosRequest,
  extractAndSimplify,
  isFullUrl,
  joinUrlParts,
  getTypeCheckInput,
} from '../_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  CombinedOperatorNode,
  GenericObject,
  OperatorObject,
} from '../../types'
import operatorData, { requiredProperties, propertyAliases } from './data'

export type APINode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & {
    parameters?: EvaluatorNode
    returnProperty?: EvaluatorNode
    headers?: GenericObject
  }

const evaluate = async (expression: APINode, config: FigTreeConfig): Promise<EvaluatorOutput> => {
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
    string | { url: string; headers: GenericObject },
    { [key: string]: string },
    string,
    GenericObject,
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

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? true

  const result = await config.cache.useCache(
    shouldUseCache,
    async (
      url: string,
      params: { [key: string]: string },
      headers: GenericObject,
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

const parseChildren = async (
  expression: CombinedOperatorNode,
  config: FigTreeConfig
): Promise<APINode> => {
  const [url = '', fieldNames, ...rest] = (await evaluateArray(
    expression.children as EvaluatorNode[],
    config
  )) as [string, string[]]
  const fieldKeys = Array.isArray(fieldNames) ? fieldNames : [fieldNames]
  const values = rest.slice(0, fieldKeys.length)
  const parameters = zipArraysToObject(fieldKeys, values)
  const output = { ...expression, url, parameters }
  if (rest.length > fieldKeys.length) output.returnProperty = rest.pop()
  return output
}

// For name clash with logicalAnd export
export const parseChildrenGET = parseChildren

export const GET: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
