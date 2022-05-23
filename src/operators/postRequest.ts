import { allPropsOk, evaluateParameters } from './helpers'
import { processAPIquery, APINode } from './getRequest'
import { EvaluatorNode, ValueNode, OperationInput, EvaluatorOptions } from '../types'

const parse = async (
  expression: APINode,
  options: EvaluatorOptions = {}
): Promise<EvaluatorNode[]> => {
  const { url, parameters = {}, returnProperty } = expression
  allPropsOk(['url'], expression)
  const evaluatedParams = await evaluateParameters(parameters, options)
  const children = [url, Object.keys(evaluatedParams), ...Object.values(evaluatedParams)]
  if (returnProperty) children.push(returnProperty)
  return children
}

const operate = async (inputObject: OperationInput): Promise<ValueNode> =>
  await processAPIquery(inputObject, true)

export const postRequest = { parse, operate }
