import extractProperty from 'object-property-extractor'
import { evaluateArray } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['property']
const operatorAliases = [
  'dataProperties',
  'data',
  'getData',
  'objectProperties',
  'objProps',
  'getProperty',
  'getObjProp',
]
const propertyAliases = {
  path: 'property',
  propertyName: 'property',
  additional: 'additionalData',
  objects: 'additionalData',
  data: 'additionalData',
  additionalObjects: 'additionalData',
}

export type ObjPropNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & { additionalData: object }

const evaluate = async (
  expression: ObjPropNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const [property, additionalData] = (await evaluateArray(
    [expression.property, expression.additionalData],
    config
  )) as [string, object]
  config.typeChecker(
    { name: 'property', value: property, expectedType: 'string' },
    { name: 'additionalData', value: additionalData, expectedType: ['object', 'undefined'] }
  )
  const inputObject = additionalData
    ? { ...(config.options?.data ?? {}), ...additionalData }
    : config.options?.data ?? {}
  return extractProperty(inputObject, property)
}

const parseChildren = (expression: CombinedOperatorNode): ObjPropNode => {
  const [property, fallback] = expression.children as EvaluatorNode[]
  const returnValue = { ...expression, property }
  if (fallback) returnValue.fallback = fallback
  return returnValue
}

export const OBJECT_PROPERTIES: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
