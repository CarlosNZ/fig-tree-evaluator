import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { errorMessage } from '../../helpers'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../../types'
import operatorData, { requiredProperties, propertyAliases } from './data'

export type RegexNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (expression: RegexNode, config: FigTreeConfig): Promise<EvaluatorOutput> => {
  const [testString, pattern] = (await evaluateArray(
    [expression.testString, expression.pattern],
    config
  )) as [string, string]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { testString, pattern }))

  try {
    const re: RegExp = new RegExp(pattern)
    return re.test(testString)
  } catch (err) {
    throw new Error('Regex error:' + errorMessage(err))
  }
}

const parseChildren = (expression: CombinedOperatorNode): RegexNode => {
  const [testString, pattern] = expression.children as EvaluatorNode[]
  return { ...expression, testString, pattern }
}

export const REGEX: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
