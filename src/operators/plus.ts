import { OperationInput } from '../operatorReference'
import { ValueNode } from '../types'
import { parse } from './logicalAnd'

const operate = ({ children, expression }: OperationInput): ValueNode => {
  if (children.length === 0) return children

  // Reduce based on "type" if specified
  if (expression?.type === 'string') return children.reduce((acc, child) => acc.concat(child), '')

  if (expression?.type === 'array') return children.reduce((acc, child) => acc.concat(child), [])

  // Concatenate arrays/strings
  if (children.every((child) => typeof child === 'string' || Array.isArray(child)))
    return children.reduce((acc, child) => acc.concat(child))

  // Merge objects
  if (children.every((child) => child instanceof Object && !Array.isArray(child)))
    return children.reduce((acc, child) => ({ ...acc, ...child }), {})

  // Or just try to add any other types
  return children.reduce((acc: number, child: number) => acc + child)
}

export const plus = { parse, operate }
