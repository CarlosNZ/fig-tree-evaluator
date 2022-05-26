import { evaluateArray } from './_helpers'
import { BaseOperatorNode, EvaluatorNode, OperatorNode, ValueNode, ExtendedOptions } from '../types'

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

export type RegexNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode[]
} & BaseOperatorNode

const evaluate = async (expression: RegexNode, options: ExtendedOptions): Promise<ValueNode> => {
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
