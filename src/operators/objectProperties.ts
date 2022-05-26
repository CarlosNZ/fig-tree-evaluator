import { evaluateArray } from './_helpers'
import extractProperty from 'object-property-extractor'
import { BaseOperatorNode, EvaluatorNode, OperatorNode, ValueNode, ExtendedOptions } from '../types'

const requiredProperties = ['property']
const operatorAliases = ['objectProperties', 'objProps', 'getProperty', 'getObjProp']
const propertyAliases = {
  path: 'property',
  propertyName: 'property',
}

export type ObjPropNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode[]
} & BaseOperatorNode & { fallback: ValueNode }

const evaluate = async (expression: ObjPropNode, options: ExtendedOptions): Promise<ValueNode> => {
  const [property, fallback] = (await evaluateArray([expression.property], options)) as [
    string,
    any
  ]
  const inputObject = options.options?.objects ?? {}
  return extractProperty(inputObject, property, fallback)
}

const parseChildren = (expression: OperatorNode): OperatorNode => {
  const [property, fallback] = expression.children as EvaluatorNode[]
  return { ...expression, property, fallback }
}

export const OBJECT_PROPERTIES = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
