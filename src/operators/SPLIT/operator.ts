import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import {
  FigTreeConfig,
  OperatorObject,
  EvaluatorNode,
  CombinedOperatorNode,
  BaseOperatorNode,
} from '../../types'
import operatorData, { requiredProperties, propertyAliases } from './data'

export type SplitNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & {
    delimiter?: EvaluatorNode
    trimWhiteSpace: EvaluatorNode
    excludeTrailing: EvaluatorNode
  }

const DEFAULT_DELIMITER = ' '

const evaluate = async (expression: SplitNode, config: FigTreeConfig): Promise<string[]> => {
  const [value, delimiter, trimWhiteSpace, excludeTrailing] = (await evaluateArray(
    [
      expression.value,
      expression.delimiter ?? DEFAULT_DELIMITER,
      expression.trimWhiteSpace ?? true,
      expression.excludeTrailing ?? true,
    ],
    config
  )) as [string, string, boolean, boolean]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, {
      value,
      delimiter,
      trimWhiteSpace,
      excludeTrailing,
    })
  )

  let splitValues = value.split(delimiter)
  if (trimWhiteSpace) splitValues = splitValues.map((val) => val.trim())
  if (excludeTrailing && splitValues[splitValues.length - 1] === '') splitValues.pop()
  return splitValues
}

const parseChildren = (expression: CombinedOperatorNode): SplitNode => {
  const [value, delimiter = DEFAULT_DELIMITER] = expression.children as EvaluatorNode[]
  return { ...expression, value, delimiter }
}

export const SPLIT: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
