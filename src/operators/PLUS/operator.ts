import { parseChildren, BasicExtendedNode } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { EvaluatorOutput, FigTreeConfig, OperatorObject, EvaluatorNode } from '../../types'

import operatorData, { requiredProperties, propertyAliases } from './data'

export type AdditionNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BasicExtendedNode & { type?: 'string' | 'array' }

const evaluate = async (
  expression: AdditionNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  if (expression.values.length === 0) return expression.values

  const values = (await evaluateArray(expression.values, config)) as any[]

  config.typeChecker(
    ...getTypeCheckInput(operatorData.parameters, {
      values,
      type: expression.type,
    })
  )

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
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
