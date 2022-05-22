import {
  allPropsOk,
  zipArraysToObject,
  assignChildNodesToQuery,
  extractAndSimplify,
} from '../utils/utils'
import { OperatorNode, EvaluatorNode, ValueNode, OperationInput, GraphQLConnection } from '../types'

const parse = (expression: OperatorNode): EvaluatorNode[] => {
  const { query, url = '', variables = {}, returnNode } = expression
  allPropsOk(['query'], expression)
  const children = [query, url, Object.keys(variables), ...Object.values(variables)]
  if (returnNode) children.push(returnNode)
  return children
}

const operate = async ({ children, options }: OperationInput): Promise<ValueNode> => {
  if (!options?.graphQLConnection) throw new Error('No GraphQL database connection provided')
  const gqlHeaders = options?.headers ?? options.graphQLConnection.headers
  return await processGraphQL(children, options.graphQLConnection, gqlHeaders)
}

const processGraphQL = async (
  queryArray: any[],
  connection: GraphQLConnection,
  gqlHeaders: { [key: string]: string } = {}
) => {
  try {
    const {
      url,
      headers: queryHeaders,
      query,
      fieldNames,
      values,
      returnProperty,
    } = assignChildNodesToQuery(queryArray)
    const variables = zipArraysToObject(fieldNames, values)
    const headers = queryHeaders ?? gqlHeaders
    const data = await graphQLquery(url, query, variables, connection, headers)
    if (!data) throw new Error('GraphQL query problem')
    try {
      return extractAndSimplify(data, returnProperty)
    } catch (err) {
      throw err
    }
  } catch (err) {
    throw err
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

export const graphQL = { parse, operate }
