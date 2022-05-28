import { evaluateArray, zipArraysToObject, processAPIquery } from './_operatorUtils'
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

// For name clash with logicalAnd export
export const parseChildrenGET = parseChildren

export const GET: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
