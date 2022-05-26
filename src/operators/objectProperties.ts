import extractProperty from 'object-property-extractor'
import { evaluateArray } from './_helpers'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  ValueNode,
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
} & BaseOperatorNode & { fallback: ValueNode }

const evaluate = async (expression: ObjPropNode, config: EvaluatorConfig): Promise<ValueNode> => {
  const [property, fallback] = (await evaluateArray([expression.property], config)) as [string, any]
  const inputObject = config.options?.objects ?? {}
  return extractProperty(inputObject, property, fallback)
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
