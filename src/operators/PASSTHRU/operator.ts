import { evaluatorFunction } from '../../evaluate'
import { OperatorObject, EvaluatorNode, EvaluateMethod, ParseChildrenMethod } from '../../types'
import { getTypeCheckInput } from '../_operatorUtils'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  config.typeChecker(getTypeCheckInput(operatorData.parameters, { value: expression.value }))

  return await evaluatorFunction(expression.value, config)
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [...children] = expression.children as EvaluatorNode[]
  const value = children?.length === 1 ? children[0] : children
  return { ...expression, value }
}

export const PASSTHRU: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
