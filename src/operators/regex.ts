import { allPropsOk } from './helpers'
import { BaseOperatorNode, EvaluatorNode, ValueNode, OperationInput } from '../types'

const parse = (expression: BaseOperatorNode): EvaluatorNode[] => {
  const { testString, pattern } = expression
  allPropsOk(['testString', 'pattern'], expression)
  return [testString, pattern]
}

const operate = ({ children }: OperationInput): ValueNode => {
  try {
    const str: string = children[0]
    if (typeof children[1] !== 'string') throw new Error('Invalid Regex pattern')
    const re: RegExp = new RegExp(children[1])
    return re.test(str)
  } catch (err) {
    throw err
  }
}

export const regex = { parse, operate }
