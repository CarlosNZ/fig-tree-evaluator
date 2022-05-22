import extractProperty from 'object-property-extractor/build/extract'
import { allPropsOk } from '../utils/utils'
import { OperatorNode, EvaluatorNode, ValueNode, OperationInput } from '../types'

const parse = (expression: OperatorNode): EvaluatorNode[] => {
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
