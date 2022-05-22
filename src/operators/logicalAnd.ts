import { allPropsOk } from '../utils/utils'
import { EvaluatorNode, OperatorNode, OperationInput, AndNode } from '../types'

export const parse = (expression: AndNode): EvaluatorNode[] => {
  const { values } = expression
  allPropsOk(['values'], expression)
  return values as EvaluatorNode[]
}

const operate = ({ children }: OperationInput): boolean =>
  children.reduce((acc: boolean, child: boolean) => acc && (child as boolean), true)

export const logicalAnd = { parse, operate }
