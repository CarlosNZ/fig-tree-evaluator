import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  CombinedOperatorNode,
  GenericObject,
  OperatorObject,
} from '../../types'
import operatorData, { propertyAliases } from './data'

export type BuildObjectNode = {
  properties: BuildObjectElement[]
} & BaseOperatorNode

type BuildObjectElement = { key: EvaluatorNode; value: EvaluatorNode }

const evaluate = async (
  expression: BuildObjectNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const evaluatePair = async (nodes: [EvaluatorNode, EvaluatorNode]) => {
    const [key, value] = (await evaluateArray(nodes, config)) as [string, EvaluatorOutput]
    config.typeChecker({ name: 'key', value: key, expectedType: ['string', 'number', 'boolean'] })
    return [key, value]
  }

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, { properties: expression.properties })
  )

  const evaluated = expression.properties
    // Remove any objects that don't have both "key" and "value" props
    .filter(
      (element: GenericObject) =>
        element instanceof Object && 'key' in element && 'value' in element
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
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
