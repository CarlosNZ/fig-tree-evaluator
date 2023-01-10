import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { EvaluatorNode, FigTreeConfig, OperatorObject, BaseOperatorNode } from '../types'

const requiredProperties = [] as const
const operatorAliases = ['/', 'divide', '÷']
const propertyAliases = { divide: 'dividend', by: 'divisor', divideBy: 'divisor' }

interface DivisionNodeWithProps extends BaseOperatorNode {
  dividend: EvaluatorNode
  divisor: EvaluatorNode
}

type DivisionOutput = 'quotient' | 'remainder'

export type DivisionNode = BasicExtendedNode & DivisionNodeWithProps & { output?: DivisionOutput }

const evaluate = async (expression: DivisionNode, config: FigTreeConfig): Promise<number> => {
  const [values, output] = (await evaluateArray(
    [expression.values ?? [expression.dividend, expression.divisor], expression.output],
    config
  )) as [number[], DivisionOutput]

  config.typeChecker(
    { name: 'values', value: values, expectedType: 'array' },
    { name: 'output', value: output, expectedType: ['string', 'undefined'] }
  )

  if (values.length < 2) throw new Error('- Not enough values provided')
  if (!values[1]) throw new Error('Division by zero!')

  switch (output) {
    case 'quotient':
      return Math.floor(values[0] / values[1])
    case 'remainder':
      return values[0] % values[1]
    default:
      return values[0] / values[1]
  }
}

export const DIVIDE: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
