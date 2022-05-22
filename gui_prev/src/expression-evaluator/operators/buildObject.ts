import { allPropsOk } from '../utils/utils'
import { OperatorNode, EvaluatorNode, ValueNode, OperationInput } from '../types'

const parse = (expression: OperatorNode): EvaluatorNode[] => {
  allPropsOk(['properties'], expression)
  const properties: { key: string; value: any }[] = expression?.properties
  return (
    properties
      // We ignore incorrectly structured input objects rather than throw error
      .filter((obj) => obj instanceof Object && 'key' in obj && 'value' in obj)
      .reduce((acc: any[], obj) => {
        acc.push(obj?.key, obj?.value)
        return acc
      }, [])
  )
}

const operate = ({ children }: OperationInput): ValueNode => {
  if (children.length % 2 !== 0)
    throw new Error('Even number of children required to make key/value pairs')
  const output: { [key: string]: any } = {}
  const currPair: any[] = []
  children.forEach((val) => {
    if (currPair.length === 2) {
      output[currPair[0]] = currPair[1]
      currPair.length = 0
    }
    currPair.push(val)
  })
  if (currPair.length === 2) {
    output[currPair[0]] = currPair[1]
    currPair.length = 0
  }
  return output
}

export const buildObject = { parse, operate }
