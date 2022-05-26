import { evaluateArray, zipArraysToObject, extractAndSimplify, fetchAPIrequest } from './_helpers'
import {
  BaseOperatorNode,
  EvaluatorNode,
  ValueNode,
  EvaluatorConfig,
  CombinedOperatorNode,
  BasicObject,
} from '../types'

const requiredProperties = ['url']
const operatorAliases = ['get', 'api']
const propertyAliases = { endpoint: 'url', outputProperty: 'returnProperty' }

export type APINode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & {
    parameters?: EvaluatorNode
    returnProperty?: EvaluatorNode
  }

const evaluate = async (expression: APINode, config: EvaluatorConfig): Promise<ValueNode> => {
  if (!config.options?.graphQLConnection) throw new Error('No GraphQL database connection provided')

  const [urlObj, parameters, returnProperty] = (await evaluateArray(
    [expression.url, expression.parameters, expression.returnProperty],
    config
  )) as [string | { url: string; headers: BasicObject }, BasicObject, string]

  const { url, headers } = urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  const httpHeaders = headers ?? config.options?.headers ?? config.options.graphQLConnection.headers
  return await processGraphQL(
    { query, url, variables, returnNode },
    config.options.graphQLConnection,
    gqlHeaders
  )
}

const parseChildren = async (
  expression: CombinedOperatorNode,
  config: EvaluatorConfig
): Promise<APINode> => {
  const [url = '', ...rest] = expression.children as EvaluatorNode[]
  // TO-DO Evaluate array elements one by one
  const fieldNames = (await evaluateArray(rest[0] as [], config)) as string[]
  const values = rest.slice(1, fieldNames.length + 2)
  const variables = zipArraysToObject(fieldNames, values)
  const output = { ...expression, url, variables }
  if (rest.length >= fieldNames.length + 2) output.returnNode = rest[fieldNames.length + 1]
  return output
}

const operate = async (inputObject: OperationInput): Promise<ValueNode> =>
  await processAPIquery(inputObject)

export const getRequest = { parse, operate }
