import { allPropsOk } from '../utils/utils'
import { OperatorNode, EvaluatorNode, ValueNode, OperationInput } from '../types'

const parse = (expression: OperatorNode): EvaluatorNode[] => {
  const { condition, valueIfTrue, valueIfFalse } = expression
  allPropsOk(['condition', 'valueIfTrue', 'valueIfFalse'], expression)
  return [condition, valueIfTrue, valueIfFalse]
}

const operate = ({ children }: OperationInput): ValueNode =>
  children[0] ? children[1] : children[2]

export const conditional = { parse, operate }
