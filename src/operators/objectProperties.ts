import extractProperty from 'object-property-extractor/build/extract'
import { hasRequiredProps } from './_helpers'
import { OperationInput } from '../operatorReference'
import { EvaluatorNode, ValueNode, BaseOperatorNode } from '../types'

export interface ObjPropNode extends BaseOperatorNode {
  property?: string
}

const parse = (expression: ObjPropNode): EvaluatorNode[] => {
  const { property } = expression
  hasRequiredProps(['property'], expression)
  return [property]
}

const operate = ({ children, options }: OperationInput): ValueNode => {
  const inputObject = options?.objects ? options.objects : {}
  const property = children[0]
  const fallback = children?.[1]
  return extractProperty(inputObject, property, fallback)
}

export const objectProperties = { parse, operate }
