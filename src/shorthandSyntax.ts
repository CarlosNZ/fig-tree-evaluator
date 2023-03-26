import { EvaluatorNode, OperatorAliases, Fragments, FragmentNode } from './types'
import { getOperatorName, isFragmentNode, isOperatorNode, isObject, isAliasString } from './helpers'
import opAliases from './operators/_operatorAliases.json'

const operatorAliases = opAliases as OperatorAliases // Set type for JSON object

const functionStringRegex = /(\$[^\(\)]+)\((.*)\)/

export const preProcessShorthand = (
  expression: object | string,
  fragments: Fragments = {}
): EvaluatorNode | FragmentNode => {
  if (typeof expression === 'string') return processString(expression, fragments)

  if (isObject(expression)) return processObject(expression, fragments)

  return expression
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
  const aliasParams = keyVals.filter(([key]) => isAliasString(key))
  const otherParams = keyVals.filter(([key]) => !isAliasString(key))

  const newKeyVals = aliasParams.reduce((accObj: Record<string, any>, [alias, params]) => {
    const operator = getOperatorName(alias.slice(1), operatorAliases)

    if (operator) {
      accObj.operator = operator
      if (Array.isArray(params)) {
        accObj.children = params
        return accObj
      }
      if (isObject(params)) {
        accObj = { ...accObj, ...params }
        return accObj
      }
      accObj.children = [params]
      return accObj
    }

    if (alias.slice(1) in fragments) {
      accObj.fragment = alias.slice(1)
      accObj.parameters = { ...params }
      return accObj
    }

    accObj[alias] = params
    return accObj
  }, {})

  return {
    ...newKeyVals,
    ...Object.fromEntries(otherParams),
  }
}

const buildEvaluatorNode = (alias: string, params: any[] | object, fragments: Fragments) => {
  const aliasName = alias.slice(1)
  const operator = getOperatorName(aliasName, operatorAliases)

  if (operator) {
    if (Array.isArray(params)) return { operator, children: params }
    if (isObject(params)) return { operator, ...params }
    return { operator, children: [params] }
  }

  if (aliasName in fragments) {
    return { fragment: aliasName, parameters: { ...params } }
  }

  return { [alias]: params }
}
