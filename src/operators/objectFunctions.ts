import extractProperty from 'object-property-extractor/build/extract'
import { hasRequiredProps } from './_helpers'
import { OperationInput } from '../operatorReference'
import { BaseOperatorNode, EvaluatorNode, ValueNode } from '../types'

export interface ObjFuncNode extends BaseOperatorNode {
  functionPath?: EvaluatorNode
  args?: EvaluatorNode[]
}

const parse = (expression: ObjFuncNode): EvaluatorNode[] => {
  const { functionPath, args } = expression
  hasRequiredProps(['functionPath'], expression)
  return [functionPath, ...(args as [])]
}

const operate = async ({ children, options }: OperationInput): Promise<ValueNode> => {
  const inputObject = options?.objects ? options.objects : {}
  const funcName = children[0]
  const args = children.slice(1)
  const func = extractProperty(inputObject, funcName) as Function
  return await func(...args)
}

export const objectFunctions = { parse, operate }
