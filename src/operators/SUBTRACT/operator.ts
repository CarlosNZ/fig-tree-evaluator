import { parseChildren, BasicExtendedNode } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { EvaluatorNode, FigTreeConfig, OperatorObject, BaseOperatorNode } from '../../types'
import operatorData, { requiredProperties, propertyAliases } from './data'

interface SubtractionNodeWithProps extends BaseOperatorNode {
  subtract: EvaluatorNode
  from: EvaluatorNode
}

export type SubtractionNode = BasicExtendedNode & SubtractionNodeWithProps

const evaluate = async (expression: SubtractionNode, config: FigTreeConfig): Promise<number> => {
  const [values, from, subtract] = (await evaluateArray(
    [expression.values, expression.from, expression.subtract],
    config
  )) as [[number, number], number, number]
  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values, from, subtract }))

  const vals = values ?? [from, subtract].filter((e) => e !== undefined)

  if (vals.length < 2) throw new Error('- Not enough values provided')
  if (vals.some((e) => typeof e !== 'number')) throw new Error('- Not all values are numbers')

  return vals[0] - vals[1]
}

export const SUBTRACT: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
