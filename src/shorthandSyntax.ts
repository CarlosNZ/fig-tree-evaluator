import { EvaluatorNode, OperatorAliases, Fragments, FragmentNode } from './types'
import { getOperatorName, isFragmentNode, isOperatorNode, isObject, isAliasString } from './helpers'
import { operatorAliases as opAliases } from './operators/operatorAliases'

const operatorAliases = opAliases as OperatorAliases // Set type for JSON object

const functionStringRegex = /(\$[^()]+)\((.*)\)/

export const preProcessShorthand = (
  expression: EvaluatorNode,
  fragments: Fragments = {},
  useShorthand = true
): EvaluatorNode | FragmentNode => {
  if (!useShorthand) return expression

  if (typeof expression === 'string') return processString(expression, fragments)
  if (isObject(expression)) return processObject(expression, fragments)

  return expression
}

const processString = (expString: string, fragments: Fragments): EvaluatorNode => {
  const match = functionStringRegex.exec(expString)
  if (!match) return expString

  const method = match[1].trim()
  const params = match[2].split(',').map((p) => preProcessShorthand(p.trim(), fragments))

  return buildNodeElements(method, params, fragments)
}

const processObject = (expObject: object, fragments: Fragments) => {
  if (isOperatorNode(expObject) || isFragmentNode(expObject)) return expObject

  const keyVals = Object.entries(expObject)
  const aliasParams = keyVals.filter(([key]) => isAliasString(key))
  const otherParams = keyVals.filter(([key]) => !isAliasString(key))

  const newKeyVals = aliasParams.reduce((accObj: Record<string, unknown>, [alias, params]) => {
    accObj = { ...accObj, ...buildNodeElements(alias, params, fragments) }
    return accObj
  }, {})

  return {
    ...newKeyVals,
    ...Object.fromEntries(otherParams),
  }
}

const buildNodeElements = (
  alias: string,
  params: EvaluatorNode[] | object,
  fragments: Fragments
) => {
  const aliasName = alias.slice(1)
  const operator = getOperatorName(aliasName, operatorAliases)

  if (operator) {
    if (Array.isArray(params)) return { operator, children: params }
    if (isObject(params) && !Object.keys(params).some((key) => isAliasString(key)))
      return { operator, ...params }
    return { operator, children: [params] }
  }

  if (aliasName in fragments) {
    return { fragment: aliasName, parameters: { ...params } }
  }

  return { [alias]: params }
}
