import extractProperty from 'object-property-extractor'
import { evaluateArray } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  EvaluatorConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['property']
const operatorAliases = ['objectProperties', 'objProps', 'getProperty', 'getObjProp']
const propertyAliases = {
  path: 'property',
  propertyName: 'property',
}

export type ObjPropNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode

const evaluate = async (
  expression: ObjPropNode,
  config: EvaluatorConfig
): Promise<EvaluatorOutput> => {
  const [property] = (await evaluateArray([expression.property], config)) as [string, any]
  const inputObject = config.options?.objects ?? {}
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
