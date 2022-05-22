import { allPropsOk } from '../utils/utils'
import { OperatorNode, EvaluatorNode, ValueNode, OperationInput } from '../types'

const parse = (expression: OperatorNode): EvaluatorNode[] => {
  const { testString, pattern } = expression
  allPropsOk(['testString', 'pattern'], expression)
  return [testString, pattern]
}

const operate = ({ children }: OperationInput): ValueNode => {
  try {
    const str: string = children[0]
    const re: RegExp = new RegExp(children[1])
    return re.test(str)
  } catch {
    throw new Error('Problem with REGEX')
  }
}

export const regex = { parse, operate }
