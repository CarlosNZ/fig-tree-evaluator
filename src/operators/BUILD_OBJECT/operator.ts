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
import { isObject } from '../../helpers'

const evaluate: EvaluateMethod = async (expression, config) => {
  const children = (await evaluateArray(expression.properties, config)) as object[]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { properties: children }))

  // Input can be  *either* an array of objects with key/value properties OR an
  // alternating sequence of keys/values -- in the latter case we need to parse
  // it as "children"
  const { properties } = children.some((prop) => !isObject(prop))
    ? await parseChildren({ ...expression, children }, config)
    : { properties: children }

  const evaluatePair = async (nodes: [EvaluatorNode, EvaluatorNode]) => {
    const [key, value] = (await evaluateArray(nodes, config)) as [string, EvaluatorOutput]
    config.typeChecker({ name: 'key', value: key, expectedType: ['string', 'number', 'boolean'] })
    return [key, value]
  }

  const evaluated = (properties as { key: EvaluatorNode; value: EvaluatorNode }[])
    // Remove any objects that don't have both "key" and "value" props
    .filter((element) => element instanceof Object && 'key' in element && 'value' in element)
    .map(({ key, value }) => evaluatePair([key, value]))

  return Object.fromEntries(await Promise.all(evaluated))
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const elements = expression.children as EvaluatorNode[]

  // Elements can come in as *either* an array of objects with key/value
  // properties OR an alternating sequence of keys/values
  if (elements.every((el) => isObject(el))) return { ...expression, properties: elements }

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
