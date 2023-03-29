import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { errorMessage } from '../../helpers'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [testString, pattern] = (await evaluateArray(
    [expression.testString, expression.pattern],
    config
  )) as [string, string]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { testString, pattern }))

  try {
    const re = new RegExp(pattern)
    return re.test(testString)
  } catch (err) {
    throw new Error('Regex error:' + errorMessage(err))
  }
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
