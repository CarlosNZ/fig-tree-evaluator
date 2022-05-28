import { zipArraysToObject, extractAndSimplify, evaluateArray } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  EvaluatorOutput,
  EvaluatorConfig,
  CombinedOperatorNode,
  GenericObject,
  OperatorObject,
} from '../types'
import { errorMessage } from '../helpers'

const requiredProperties = ['query'] as const
const operatorAliases = ['graphQl', 'graphql', 'gql']
const propertyAliases = { endpoint: 'url', outputNode: 'returnNode', returnPropery: 'returnNode' }

export type GraphQLNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & {
    url?: EvaluatorNode
    variables?: EvaluatorNode
    returnNode?: EvaluatorNode
  }

const evaluate = async (
  expression: GraphQLNode,
  config: EvaluatorConfig
): Promise<EvaluatorOutput> => {
  if (!config.options?.graphQLConnection) throw new Error('No GraphQL database connection provided')

  const [query, urlObj, variables, returnNode] = (await evaluateArray(
    [expression.query, expression.url, expression.variables, expression.returnNode],
    config
  )) as [string, string | { url: string; headers: GenericObject }, GenericObject, string]

  const { url, headers } = urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  const gqlHeaders = {
    ...config.options.graphQLConnection.headers,
    ...config.options?.headers,
    ...headers,
  }

  return await processGraphQL(
    { query, url, variables, returnNode },
    config.options.graphQLConnection,
    gqlHeaders
  )
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
  fetch: Function
  endpoint: string
  headers?: { [key: string]: string }
}

const processGraphQL = async (
  {
    query,
    url,
    variables,
    returnNode,
  }: { query: string; url: string; variables: GenericObject; returnNode?: string },
  connection: GraphQLConnection,
  gqlHeaders: GenericObject = {}
) => {
  try {
    const data = await graphQLquery(url, query, variables, connection, gqlHeaders)
    if (!data) throw new Error('GraphQL query problem -- no data retrieved')
    return extractAndSimplify(data, returnNode)
  } catch (err) {
    throw new Error('GraphQL Problem: ' + errorMessage(err))
  }
}

// Abstraction for GraphQL database query using Fetch
const graphQLquery = async (
  url: string,
  query: string,
  variables: object,
  connection: GraphQLConnection,
  headers: { [key: string]: string }
) => {
  // Get an external endpoint to use, or get the default GraphQL endpoint if
  // received: "graphqlendpoint" (case insensitive), an empty string "" or null
  const endpoint = !url || url.toLowerCase() === 'graphqlendpoint' ? connection.endpoint : url

  const queryResult = await connection.fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      query: query,
      variables: variables,
    }),
  })
  const data = await queryResult.json()
  if (data?.errors) {
    const errorMessage = data.errors[0].message
    throw new Error(errorMessage)
  }
  return data.data
}

export const GRAPHQL: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
