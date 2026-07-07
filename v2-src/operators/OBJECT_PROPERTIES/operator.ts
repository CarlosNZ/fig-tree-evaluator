import extractProperty from 'object-property-extractor'
import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [property, additionalData = {}] = (await evaluateArray(
    [expression.property, expression.additionalData],
    config
  )) as [string, object]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { property, additionalData }))

  const inputObject = { ...(config.options?.data ?? {}), ...additionalData }
  return extractProperty(inputObject, property)
}

const parseChildren: ParseChildrenMethod = (expression) => {
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
