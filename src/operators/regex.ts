import { evaluateArray } from './_helpers'
import {
  BaseOperatorNode,
  EvaluatorNode,
  EvaluatorOptions,
  OperatorNode,
  ValueNode,
} from '../types'

const requiredProperties = ['testString', 'pattern']
const operatorAliases = ['regex', 'patternMatch', 'regexp', 'matchPattern']
const propertyAliases = {
  string: 'testString',
  value: 'testString',
  regex: 'pattern',
  regexp: 'pattern',
  regExp: 'pattern',
  re: 'pattern',
}

export interface RegexNode extends BaseOperatorNode {
  pattern: EvaluatorNode
  testString: EvaluatorNode
}

const evaluate = async (expression: RegexNode, options: EvaluatorOptions): Promise<ValueNode> => {
  const [testString, pattern] = (await evaluateArray(
    [expression.testString, expression.testString],
    options
  )) as [string, string]
  try {
    if (typeof pattern !== 'string') throw new Error('Invalid Regex pattern')
    const re: RegExp = new RegExp(pattern)
    return re.test(testString)
  } catch (err) {
    throw err
  }
}

const parseChildren = (expression: OperatorNode): OperatorNode => {
  const [testString, pattern] = expression.children as EvaluatorNode[]
  return { ...expression, testString, pattern }
}

export const REGEX = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
