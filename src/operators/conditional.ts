import { evaluateArray } from './_helpers'
import { BaseOperatorNode, EvaluatorNode, OperatorNode, ValueNode, ExtendedOptions } from '../types'

const requiredProperties = ['condition', 'valueIfTrue', 'valueIfFalse']
const operatorAliases = ['?', 'conditional', 'ifThen']
const propertyAliases = { ifTrue: 'valueIfTrue', ifFalse: 'valueIfFalse', ifNot: 'valueIfFalse' }

export type ConditionalNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode[]
} & BaseOperatorNode

const evaluate = async (
  expression: ConditionalNode,
  options: ExtendedOptions
): Promise<ValueNode> => {
  const [condition, valueIfTrue, valueIfFalse] = await evaluateArray(
    [expression.condition, expression.valueIfTrue, expression.valueIfFalse],
    options
  )
  return condition ? valueIfTrue : valueIfFalse
}

const parseChildren = (expression: OperatorNode): OperatorNode => {
  const [condition, valueIfTrue, valueIfFalse] = expression.children as EvaluatorNode[]
  return { ...expression, condition, valueIfTrue, valueIfFalse }
}

export const CONDITIONAL = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
