import { allPropsOk } from './_helpers'
import { OperationInput } from '../operatorReference'
import { EvaluatorNode, BaseOperatorNode } from '../types'
export interface BasicExtendedNode extends BaseOperatorNode {
  values?: EvaluatorNode[]
}

export const parse = (expression: BasicExtendedNode): EvaluatorNode[] => {
  const { values } = expression
  allPropsOk(['values'], expression)
  return values as EvaluatorNode[]
}

const operate = ({ children }: OperationInput): boolean =>
  children.reduce((acc: boolean, child: boolean) => acc && (child as boolean), true)

export const logicalAnd = { parse, operate }
