import extractProperty from 'object-property-extractor/build/extract'
import { allPropsOk } from '../utils/utils'
import { OperatorNode, EvaluatorNode, ValueNode, OperationInput } from '../types'

const parse = (expression: OperatorNode): EvaluatorNode[] => {
  const { functionPath, args } = expression
  allPropsOk(['functionPath'], expression)
  return [functionPath, ...args]
}

const operate = async ({ children, options }: OperationInput): Promise<ValueNode> => {
  const inputObject = options?.objects ? options.objects : {}
  const funcName = children[0]
  const args = children.slice(1)
  const func = extractProperty(inputObject, funcName) as Function
  return await func(...args)
}

export const objectFunctions = { parse, operate }
