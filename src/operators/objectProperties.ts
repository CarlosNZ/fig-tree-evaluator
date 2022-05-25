import { evaluateArray } from './_helpers'
import extractProperty from 'object-property-extractor'
import {
  BaseOperatorNode,
  EvaluatorNode,
  EvaluatorOptions,
  OperatorNode,
  ValueNode,
} from '../types'

const requiredProperties = ['property']
const operatorAliases = ['objectProperties', 'objProps', 'getProperty', 'getObjProp']
const propertyAliases = {
  path: 'property',
  propertyName: 'property',
}

export interface ObjPropNode extends BaseOperatorNode {
  property: EvaluatorNode
}

const evaluate = async (expression: ObjPropNode, options: EvaluatorOptions): Promise<ValueNode> => {
  const [property, fallback] = (await evaluateArray([expression.property], options)) as [
    string,
    any
  ]
  const inputObject = options?.objects ? options.objects : {}
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
