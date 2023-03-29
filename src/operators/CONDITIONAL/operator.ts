import { evaluatorFunction } from '../../evaluate'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../../types'
import { getTypeCheckInput } from '../_operatorUtils'
import operatorData, { propertyAliases } from './data'

export type ConditionalNode = {
  condition: EvaluatorNode
  valueIfTrue: EvaluatorNode
  valueIfFalse: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (
  expression: ConditionalNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
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
  return !!condition
    ? await evaluatorFunction(expression.valueIfTrue, config)
    : await evaluatorFunction(expression.valueIfFalse, config)
}

const parseChildren = (expression: CombinedOperatorNode): ConditionalNode => {
  const [condition, valueIfTrue, valueIfFalse] = expression.children as EvaluatorNode[]
  return { ...expression, condition, valueIfTrue, valueIfFalse }
}

export const CONDITIONAL: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
