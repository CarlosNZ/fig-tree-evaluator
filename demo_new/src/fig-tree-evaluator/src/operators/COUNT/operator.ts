import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluateMethod, EvaluatorNode, OperatorObject, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const values = await evaluateArray(expression.values, config)

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values }))

  return values.length
}

const parseChildren: ParseChildrenMethod = (expression) => {
  // Since the *values* property is an array, it needs be nested *within* the
  // "children" array
  const [values] = expression.children as EvaluatorNode[]
  return { ...expression, values }
}

export const COUNT: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
