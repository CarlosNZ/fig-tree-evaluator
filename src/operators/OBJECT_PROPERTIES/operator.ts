import extractProperty from 'object-property-extractor'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../../types'
import operatorData, { propertyAliases } from './data'

export type ObjPropNode = {
  property: EvaluatorNode
} & BaseOperatorNode & { additionalData: object }

const evaluate = async (
  expression: ObjPropNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const [property, additionalData] = (await evaluateArray(
    [expression.property, expression.additionalData],
    config
  )) as [string, object]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { property, additionalData }))

  const inputObject = additionalData
    ? { ...(config.options?.data ?? {}), ...additionalData }
    : config.options?.data ?? {}
  return extractProperty(inputObject, property)
}

const parseChildren = (expression: CombinedOperatorNode): ObjPropNode => {
  const [property, fallback] = expression.children as EvaluatorNode[]
  const returnValue = { ...expression, property }
  if (fallback !== undefined) returnValue.fallback = fallback
  return returnValue
}

export const OBJECT_PROPERTIES: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
