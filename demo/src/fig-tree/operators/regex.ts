import { evaluateArray } from './_operatorUtils'
import { errorMessage } from '../helpers'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['testString', 'pattern'] as const
const operatorAliases = ['regex', 'patternMatch', 'regexp', 'matchPattern']
const propertyAliases = {
  string: 'testString',
  value: 'testString',
  regex: 'pattern',
  regexp: 'pattern',
  regExp: 'pattern',
  re: 'pattern',
}

export type RegexNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (expression: RegexNode, config: FigTreeConfig): Promise<EvaluatorOutput> => {
  const [testString, pattern] = (await evaluateArray(
    [expression.testString, expression.pattern],
    config
  )) as [string, string]

  config.typeChecker(
    { name: 'testString', value: testString, expectedType: 'string' },
    { name: 'pattern', value: pattern, expectedType: 'string' }
  )

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
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
