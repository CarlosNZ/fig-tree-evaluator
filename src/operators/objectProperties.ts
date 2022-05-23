import extractProperty from 'object-property-extractor/build/extract'
import { allPropsOk } from './helpers'
import { EvaluatorNode, ValueNode, OperationInput, BaseOperatorNode } from '../types'

export interface ObjPropNode extends BaseOperatorNode {
  property?: string
}

const parse = (expression: ObjPropNode): EvaluatorNode[] => {
  const { property } = expression
  allPropsOk(['property'], expression)
  return [property]
}

const operate = ({ children, options }: OperationInput): ValueNode => {
  const inputObject = options?.objects ? options.objects : {}
  const property = children[0]
  const fallback = children?.[1]
  return extractProperty(inputObject, property, fallback)
}

export const objectProperties = { parse, operate }
