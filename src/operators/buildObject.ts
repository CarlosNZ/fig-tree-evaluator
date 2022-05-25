import { hasRequiredProps } from './_helpers'
import { OperationInput } from '../operatorReference'
import { BaseOperatorNode, EvaluatorNode, ValueNode } from '../types'

export interface BuildObjectNode extends BaseOperatorNode {
  properties?: EvaluatorNode
}

const parse = (expression: BuildObjectNode): EvaluatorNode[] => {
  hasRequiredProps(['properties'], expression)
  const properties = expression?.properties as { key: string; value: any }[]
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
