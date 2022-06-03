import { evaluateArray } from './_operatorUtils'
import { EvaluatorOutput, EvaluatorConfig, OperatorObject, EvaluatorNode } from '../types'
import { parseChildren, BasicExtendedNode } from './logicalAnd'

const requiredProperties = ['values'] as const
const operatorAliases = ['+', 'plus', 'add', 'concat', 'join', 'merge']
const propertyAliases = {}

export type AdditionNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BasicExtendedNode & { type?: 'string' }

const evaluate = async (
  expression: AdditionNode,
  config: EvaluatorConfig
): Promise<EvaluatorOutput> => {
  if (expression.values.length === 0) return expression.values

  const values = (await evaluateArray(expression.values, config)) as any[]

  // Reduce based on "type" if specified
  if (expression?.type === 'string') return values.reduce((acc, child) => acc.concat(child), '')

  if (expression?.type === 'array') return values.reduce((acc, child) => acc.concat(child), [])

  // Concatenate arrays/strings
  if (values.every((child) => typeof child === 'string' || Array.isArray(child)))
    return values.reduce((acc, child) => acc.concat(child))

  // Merge objects
  if (values.every((child) => child instanceof Object && !Array.isArray(child)))
    return values.reduce((acc, child) => ({ ...acc, ...child }), {})

  // Or just try to add any other types
  return values.reduce((acc: number, child: number) => acc + child)
}

export const PLUS: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
