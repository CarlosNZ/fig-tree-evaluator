import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import {
  EvaluatorNode,
  EvaluatorOutput,
  OperatorObject,
  EvaluateMethod,
  ParseChildrenMethod,
} from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const evaluatePair = async (nodes: [EvaluatorNode, EvaluatorNode]) => {
    const [key, value] = (await evaluateArray(nodes, config)) as [string, EvaluatorOutput]
    config.typeChecker({ name: 'key', value: key, expectedType: ['string', 'number', 'boolean'] })
    return [key, value]
  }

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, { properties: expression.properties })
  )

  const evaluated = (expression.properties as { key: EvaluatorNode; value: EvaluatorNode }[])
    // Remove any objects that don't have both "key" and "value" props
    .filter((element) => element instanceof Object && 'key' in element && 'value' in element)
    .map(({ key, value }) => evaluatePair([key, value]))

  return Object.fromEntries(await Promise.all(evaluated))
}

const parseChildren: ParseChildrenMethod = (expression) => {
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
