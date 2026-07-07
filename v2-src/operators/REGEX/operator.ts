import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [testString, pattern] = (await evaluateArray(
    [expression.testString, expression.pattern],
    config
  )) as [string, string]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { testString, pattern }))

  const re = new RegExp(pattern)
  return re.test(testString)
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [testString, pattern] = expression.children as EvaluatorNode[]
  return { ...expression, testString, pattern }
}

export const REGEX: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
