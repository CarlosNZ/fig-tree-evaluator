import { parseChildren, BasicExtendedNode } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { EvaluatorNode, FigTreeConfig, OperatorObject, BaseOperatorNode } from '../../types'

import operatorData, { requiredProperties, propertyAliases } from './data'

interface DivisionNodeWithProps extends BaseOperatorNode {
  dividend: EvaluatorNode
  divisor: EvaluatorNode
}

type DivisionOutput = 'quotient' | 'remainder'

export type DivisionNode = BasicExtendedNode & DivisionNodeWithProps & { output?: DivisionOutput }

const evaluate = async (expression: DivisionNode, config: FigTreeConfig): Promise<number> => {
  const [values, dividend, divisor, output] = (await evaluateArray(
    [expression.values, expression.dividend, expression.divisor, expression.output],
    config
  )) as [[number, number], number, number, DivisionOutput]

  config.typeChecker(
    ...getTypeCheckInput(operatorData.parameters, { values, dividend, divisor, output })
  )

  const vals = values ?? [dividend, divisor]

  if (vals.length < 2) throw new Error('- Not enough values provided')
  if (!vals[1]) throw new Error('Division by zero!')

  switch (output) {
    case 'quotient':
      return Math.floor(vals[0] / vals[1])
    case 'remainder':
      return vals[0] % vals[1]
    default:
      return vals[0] / vals[1]
  }
}

export const DIVIDE: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
