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
const operatorAliases = ['objectProperties', 'objProps', 'getProperty', 'getObjProp']
const propertyAliases = {
  path: 'property',
  propertyName: 'property',
  additional: 'additionalObjects',
  objects: 'additionalObjects',
}

export type ObjPropNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & { additionalObjects: object }

const evaluate = async (
  expression: ObjPropNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const [property, additionalObjects] = (await evaluateArray(
    [expression.property, expression.additionalObjects],
    config
  )) as [string, object]
  config.typeChecker(
    { name: 'property', value: property, expectedType: 'string' },
    { name: 'additionalObjects', value: additionalObjects, expectedType: ['object', 'undefined'] }
  )
  const inputObject = additionalObjects
    ? { ...(config.options?.objects ?? {}), ...additionalObjects }
    : config.options?.objects ?? {}
  return extractProperty(inputObject, property)
}

const parseChildren = (expression: CombinedOperatorNode): ObjPropNode => {
  const [property, fallback] = expression.children as EvaluatorNode[]
  return { ...expression, property, fallback }
}

export const OBJECT_PROPERTIES: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
