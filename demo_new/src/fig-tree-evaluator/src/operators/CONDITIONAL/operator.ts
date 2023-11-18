import { evaluatorFunction } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import { getTypeCheckInput } from '../operatorUtils'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  // Since these can be any type, we check types first just to establish
  // existence.
  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, {
      condition: expression.condition,
      valueIfTrue: expression.valueIfTrue,
      valueIfFalse: expression.valueIfFalse,
    })
  )

  const condition = await evaluatorFunction(expression.condition, config)

  // Only evaluate the valueIfTrue/valueIfFalse branches if required to avoid
  // unnecessary computation
  return condition
    ? await evaluatorFunction(expression.valueIfTrue, config)
    : await evaluatorFunction(expression.valueIfFalse, config)
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [condition, valueIfTrue, valueIfFalse] = expression.children as EvaluatorNode[]
  return { ...expression, condition, valueIfTrue, valueIfFalse }
}

export const CONDITIONAL: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
