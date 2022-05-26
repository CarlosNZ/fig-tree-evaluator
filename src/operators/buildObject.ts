import { evaluateArray } from './_helpers'
import {
  BaseOperatorNode,
  EvaluatorNode,
  ValueNode,
  EvaluatorConfig,
  CombinedOperatorNode,
  BasicObject,
  OperatorObject,
} from '../types'

const requiredProperties = ['properties'] as const
const operatorAliases = ['buildObject', 'build', 'object']
const propertyAliases = {
  values: 'properties',
  keyValPairs: 'properties',
  keyValuePairs: 'properties',
}

export type BuildObjectNode = {
  [key in typeof requiredProperties[number]]: BuildObjectElement[]
} & BaseOperatorNode

type BuildObjectElement = { key: EvaluatorNode; value: EvaluatorNode }

const evaluate = async (
  expression: BuildObjectNode,
  config: EvaluatorConfig
): Promise<ValueNode> => {
  const evaluatePair = async (nodes: [EvaluatorNode, EvaluatorNode]) => {
    const [key, value] = (await evaluateArray(nodes, config)) as [string, ValueNode]
    return [key, value]
  }

  const evaluated = expression.properties
    // Remove any objects that don't have both "key" and "value" props
    .filter(
      (element: BasicObject) => element instanceof Object && 'key' in element && 'value' in element
    )
    .map(({ key, value }) => evaluatePair([key, value]))

  return Object.fromEntries(await Promise.all(evaluated))
}

const parseChildren = (expression: CombinedOperatorNode): BuildObjectNode => {
  const elements = expression.children as EvaluatorNode[]
  if (elements.length % 2 !== 0)
    throw new Error('Even number of children required to make key/value pairs')

  const keys = elements.filter((_, index) => index % 2 === 0)
  const values = elements.filter((_, index) => index % 2 === 1)

  const properties = keys.map((key, index) => ({ key, value: values[index] }))
  return { ...expression, properties }
}

export const BUILD_OBJECT: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
