import { evaluateArray } from './_operatorUtils'
import {
  FigTreeConfig,
  OperatorObject,
  EvaluatorNode,
  CombinedOperatorNode,
  BaseOperatorNode,
} from '../types'

const requiredProperties = ['value'] as const
const operatorAliases = ['split', 'arraySplit']
const propertyAliases = {
  string: 'value',
  separator: 'delimiter',
  trim: 'trimWhiteSpace',
  trimWhitespace: 'trimWhiteSpace',
  removeTrailing: 'excludeTrailing',
  excludeTrailingDelimiter: 'excludeTrailing',
}

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
    { name: 'value', value: value, expectedType: 'string' },
    { name: 'delimiter', value: delimiter, expectedType: 'string' },
    { name: 'trimWhiteSpace', value: trimWhiteSpace, expectedType: 'boolean' },
    { name: 'excludeTrailing', value: excludeTrailing, expectedType: 'boolean' }
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
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
