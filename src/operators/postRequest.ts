import { evaluateArray, axiosRequest, extractAndSimplify } from './_operatorUtils'
import { EvaluatorOutput, EvaluatorConfig, GenericObject, OperatorObject } from '../types'
import { parseChildrenGET as parseChildren, APINode } from './getRequest'

const requiredProperties = ['url'] as const
const operatorAliases = ['post']
const propertyAliases = { endpoint: 'url', outputProperty: 'returnProperty' }

const evaluate = async (expression: APINode, config: EvaluatorConfig): Promise<EvaluatorOutput> => {
  const [urlObj, data, returnProperty] = (await evaluateArray(
    [expression.url, expression.parameters, expression.returnProperty],
    config
  )) as [string | { url: string; headers: GenericObject }, GenericObject, string]

  const { url, headers } = urlObj instanceof Object ? urlObj : { url: urlObj, headers: null }

  const httpHeaders = { ...config.options?.headers, ...headers }
  const response = await axiosRequest({ url, data, headers: httpHeaders, method: 'post' })
  return extractAndSimplify(response, returnProperty)
}

export const POST: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
