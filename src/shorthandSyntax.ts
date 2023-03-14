import { FigTreeOptions, EvaluatorNode, OperatorAliases, Fragments } from './types'
import { getOperatorName, isFragmentNode, isOperatorNode, isObject } from './helpers'
import opAliases from './operators/_operatorAliases.json'
import * as operators from './operators'

const operatorAliases = opAliases as OperatorAliases // Set type for JSON object

const functionStringRegex = /\$([^\(\)]+)\((.*)\)/

export const preProcessShorthand = (expression: object | string, fragments: Fragments = {}) => {
  switch (typeof expression) {
    case 'string':
      return processString(expression, fragments)

    case 'object':
      return processObject(expression, fragments)

    default:
      return expression
  }
}

const processString = (expString: string, fragments: Fragments): EvaluatorNode => {
  const match = functionStringRegex.exec(expString)
  if (!match) return expString

  const method = match[1].trim()
  const params = match[2].split(',').map((p) => preProcessShorthand(p.trim()))

  return buildEvaluatorNode(method, params, fragments)
}

const processObject = (expObject: object, fragments: Fragments) => {
  if (isOperatorNode(expObject) || isFragmentNode(expObject)) return expObject

  const keyVals = Object.entries(expObject)
  if (keyVals.length !== 1) return expObject

  const [alias, params] = keyVals[0]

  return buildEvaluatorNode(alias.slice(1), params, fragments)
}

const buildEvaluatorNode = (alias: string, params: any[] | object, fragments: Fragments) => {
  const operator = getOperatorName(alias, operatorAliases)

  if (operator) {
    if (Array.isArray(params)) return { operator, children: params }
    if (isObject(params)) return { operator, ...params }
    return { operator, children: [params] }
  }

  console.log('Alias', alias)
  console.log('params', params)

  if (alias in fragments) {
    return { fragment: alias, ...params }
  }
}
