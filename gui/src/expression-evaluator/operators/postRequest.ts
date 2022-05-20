import {
  allPropsOk,
  zipArraysToObject,
  assignChildNodesToQuery,
  extractAndSimplify,
  fetchAPIrequest,
} from '../utils/utils'
import { processAPIquery } from './getRequest'
import { OperatorNode, EvaluatorNode, ValueNode, OperationInput } from '../types'

const parse = (expression: OperatorNode): EvaluatorNode[] => {
  const { url, parameters = {}, returnProperty } = expression
  allPropsOk(['url'], expression)
  const children = [url, Object.keys(parameters), ...Object.values(parameters)]
  if (returnProperty) children.push(returnProperty)
  return children
}

const operate = async (inputObject: OperationInput): Promise<ValueNode> =>
  await processAPIquery(inputObject, true)

export const postRequest = { parse, operate }
