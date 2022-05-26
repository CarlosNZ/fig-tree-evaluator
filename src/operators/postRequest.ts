import { evaluateArray } from './_operatorUtils'
import { ValueNode, EvaluatorConfig, BasicObject, OperatorObject } from '../types'
import { parseChildrenGET as parseChildren, processAPIquery, APINode } from './getRequest'

const requiredProperties = ['url'] as const
const operatorAliases = ['post']
const propertyAliases = { endpoint: 'url', outputProperty: 'returnProperty' }

const evaluate = async (expression: APINode, config: EvaluatorConfig): Promise<ValueNode> => {
  if (!config.options.APIfetch) throw new Error('No Fetch method provided for API query')

  const [urlObj, parameters, returnProperty] = (await evaluateArray(
    [expression.url, expression.parameters, expression.returnProperty],
    config
  )) as [string | { url: string; headers: BasicObject }, BasicObject, string]

  const { url, headers } = urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  const httpHeaders = { ...config.options?.headers, ...headers }
  return await processAPIquery(
    { url, parameters, returnProperty },
    config.options,
    httpHeaders,
    true
  )
}

export const POST: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
