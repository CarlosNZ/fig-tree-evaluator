import {
  zipArraysToObject,
  extractAndSimplify,
  evaluateArray,
  isFullUrl,
  joinUrlParts,
  axiosRequest,
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

const requiredProperties = ['query'] as const
const operatorAliases = ['graphQl', 'graphql', 'gql']
const propertyAliases = { endpoint: 'url', outputNode: 'returnNode', returnPropery: 'returnNode' }

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
  config: EvaluatorConfig
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

  const endpoint = !url || url.toLowerCase() === 'graphqlendpoint' ? '' : url

  const baseEndpoint =
    config.options.graphQLConnection?.endpoint ?? config.options.baseEndpoint ?? ''

  const fullUrl = isFullUrl(endpoint) ? endpoint : joinUrlParts(baseEndpoint, endpoint)

  const data = { query, variables }

  const response = await axiosRequest({
    url: fullUrl,
    method: 'post',
    data,
    headers: {
      ...config.options.graphQLConnection?.headers,
      ...config.options?.headers,
      ...headersObj,
      ...headers,
    },
  })

  return extractAndSimplify(response.data, returnNode)
}

const parseChildren = async (
  expression: CombinedOperatorNode,
  config: EvaluatorConfig
): Promise<GraphQLNode> => {
  const [query, url = '', fieldNames, ...rest] = expression.children as [string, string, string[]]
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
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
