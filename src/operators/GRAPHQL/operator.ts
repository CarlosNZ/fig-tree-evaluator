import {
  zipArraysToObject,
  extractAndSimplify,
  evaluateArray,
  isFullUrl,
  joinUrlParts,
  axiosRequest,
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

export type GraphQLNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & {
    url?: EvaluatorNode
    variables?: EvaluatorNode
    returnNode?: EvaluatorNode
    headers?: GenericObject
  }

const evaluate = async (
  expression: GraphQLNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const [query, urlObj, variables, returnNode, headers] = (await evaluateArray(
    [
      expression.query,
      expression.url,
      expression.variables,
      expression.returnNode,
      expression.headers,
    ],
    config
  )) as [
    string,
    string | { url: string; headers: GenericObject },
    GenericObject,
    string,
    GenericObject
  ]

  const { url, headers: headersObj } =
    urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  config.typeChecker([
    ...getTypeCheckInput(operatorData.parameters, { url, query, variables, returnNode, headers }),
    { name: 'headers', value: headersObj, expectedType: ['object', 'null'] },
  ])

  const endpoint = !url || url.toLowerCase() === 'graphqlendpoint' ? '' : url

  const baseEndpoint =
    config.options.graphQLConnection?.endpoint ?? config.options.baseEndpoint ?? ''

  const fullUrl = isFullUrl(endpoint) ? endpoint : joinUrlParts(baseEndpoint, endpoint)

  const data = { query, variables }

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? true

  const result = await config.cache.useCache(
    shouldUseCache,
    async (url: string, data: GenericObject, headers: GenericObject, returnNode?: string) => {
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

const parseChildren = async (
  expression: CombinedOperatorNode,
  config: FigTreeConfig
): Promise<GraphQLNode> => {
  const [query, url = '', fieldNames, ...rest] = (await evaluateArray(
    expression.children as EvaluatorNode[],
    config
  )) as [string, string, string[]]
  const values = rest.slice(0, fieldNames.length)
  const variables = zipArraysToObject(fieldNames, values)
  const output = { ...expression, query, url, variables }
  if (rest.length > fieldNames.length) output.returnNode = rest.pop()
  return output
}

export interface GraphQLConnection {
  endpoint: string
  headers?: { [key: string]: string }
}

export const GRAPHQL: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
