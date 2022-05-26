import { evaluateArray } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  ValueNode,
  EvaluatorConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['condition', 'valueIfTrue', 'valueIfFalse'] as const
const operatorAliases = ['?', 'conditional', 'ifThen']
const propertyAliases = { ifTrue: 'valueIfTrue', ifFalse: 'valueIfFalse', ifNot: 'valueIfFalse' }

export type ConditionalNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (
  expression: ConditionalNode,
  options: EvaluatorConfig
): Promise<ValueNode> => {
  const [condition, valueIfTrue, valueIfFalse] = await evaluateArray(
    [expression.condition, expression.valueIfTrue, expression.valueIfFalse],
    options
  )
  return condition ? valueIfTrue : valueIfFalse
}

const parseChildren = (expression: CombinedOperatorNode): ConditionalNode => {
  const [condition, valueIfTrue, valueIfFalse] = expression.children as EvaluatorNode[]
  return { ...expression, condition, valueIfTrue, valueIfFalse }
}

export const CONDITIONAL: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
