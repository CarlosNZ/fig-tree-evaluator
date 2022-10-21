import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { EvaluatorNode, FigTreeConfig, OperatorObject, BaseOperatorNode } from '../types'

const requiredProperties = [] as const
const operatorAliases = ['-', 'subtract', 'minus', 'takeaway']
const propertyAliases = { subtractFrom: 'from' }

interface SubtractionNodeWithProps extends BaseOperatorNode {
  subtract: EvaluatorNode
  from: EvaluatorNode
}

export type SubtractionNode = BasicExtendedNode & SubtractionNodeWithProps

const evaluate = async (expression: SubtractionNode, config: FigTreeConfig): Promise<number> => {
  const values = (await evaluateArray(
    expression.values ?? [expression.from, expression.subtract],
    config
  )) as number[]
  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })
  if (values.length < 2) throw new Error('- Not enough values provided')

  return values[0] - values[1]
}

export const SUBTRACT: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
