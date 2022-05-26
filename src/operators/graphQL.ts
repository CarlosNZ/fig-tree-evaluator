import { zipArraysToObject, extractAndSimplify, evaluateArray } from './_helpers'
import {
  BaseOperatorNode,
  EvaluatorNode,
  ValueNode,
  GraphQLConnection,
  EvaluatorConfig,
  CombinedOperatorNode,
  BasicObject,
} from '../types'

const requiredProperties = ['query']
const operatorAliases = ['graphQl', 'graphql', 'gql']
const propertyAliases = { endpoint: 'url', outputNode: 'returnNode', returnPropery: 'returnNode' }

export type GraphQLNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & {
    url?: EvaluatorNode
    variables?: EvaluatorNode
    returnNode?: EvaluatorNode
  }

const evaluate = async (expression: GraphQLNode, config: EvaluatorConfig): Promise<ValueNode> => {
  if (!config.options?.graphQLConnection) throw new Error('No GraphQL database connection provided')

  const [query, urlObj, variables, returnNode] = (await evaluateArray(
    [expression.query, expression.url, expression.variables, expression.returnNode],
    config
  )) as [string, string | { url: string; headers: BasicObject }, BasicObject, string]

  const { url, headers } = urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  const gqlHeaders = headers ?? config.options?.headers ?? config.options.graphQLConnection.headers
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
  const [query, url = '', ...rest] = expression.children as EvaluatorNode[]
  // TO-DO Evaluate array elements one by one
  const fieldNames = (await evaluateArray(rest[0] as [], config)) as string[]
  const values = rest.slice(1, fieldNames.length + 2)
  const variables = zipArraysToObject(fieldNames, values)
  const output = { ...expression, query, url, variables }
  if (rest.length >= fieldNames.length + 2) output.returnNode = rest[fieldNames.length + 1]
  return output
}

const processGraphQL = async (
  {
    query,
    url,
    variables,
    returnNode,
  }: { query: string; url: string; variables: BasicObject; returnNode?: string },
  connection: GraphQLConnection,
  gqlHeaders: BasicObject = {}
) => {
  const data = await graphQLquery(url, query, variables, connection, gqlHeaders)
  if (!data) throw new Error('GraphQL query problem')
  return extractAndSimplify(data, returnNode)
}

// Abstraction for GraphQL database query using Fetch
const graphQLquery = async (
  url: string,
  query: string,
  variables: object,
  connection: GraphQLConnection,
  headers: { [key: string]: string }
) => {
  // Get an external endpoint to use, or get the default GraphQL endpoint if received:
  // "graphqlendpoint" (case insensitive), an empty string "" or null
  const endpoint =
    url !== null && url.toLowerCase() !== 'graphqlendpoint' && url !== ''
      ? url
      : connection.endpoint

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

export const GRAPHQL = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
