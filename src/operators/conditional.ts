import { allPropsOk } from './_helpers'
import { OperationInput } from '../operatorReference'
import { BaseOperatorNode, EvaluatorNode, ValueNode } from '../types'

export interface ConditionalNode extends BaseOperatorNode {
  condition?: string
  valueIfTrue?: EvaluatorNode
  valueIfFalse?: EvaluatorNode
}

const parse = (expression: ConditionalNode): EvaluatorNode[] => {
  const { condition, valueIfTrue, valueIfFalse } = expression
  allPropsOk(['condition', 'valueIfTrue', 'valueIfFalse'], expression)
  return [condition, valueIfTrue, valueIfFalse]
}

const operate = ({ children }: OperationInput): ValueNode =>
  children[0] ? children[1] : children[2]

export const conditional = { parse, operate }
