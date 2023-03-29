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
import operatorData, { propertyAliases } from './data'

export type RegexNode = {
  testString: EvaluatorNode
  pattern: EvaluatorNode
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
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
