import { EvaluatorNode, OperatorAliases, Fragments, FragmentNode } from './types'
import { getOperatorName, isFragmentNode, isOperatorNode, isObject, isAliasString } from './helpers'
import { operatorAliases as opAliases } from './operators/operatorAliases'

const operatorAliases = opAliases as OperatorAliases // Set type for JSON object

export const preProcessShorthand = (
  expression: EvaluatorNode,
  fragments: Fragments = {},
  functionNames: string[],
  useShorthand = true
): EvaluatorNode | FragmentNode => {
  if (!useShorthand) return expression

  if (isObject(expression)) return processObject(expression, fragments, functionNames)

  return expression
}

const processObject = (expObject: object, fragments: Fragments, functionNames: string[]) => {
  if (isOperatorNode(expObject) || isFragmentNode(expObject)) return expObject

  const keyVals = Object.entries(expObject)
  const aliasParams = keyVals.filter(([key]) => isAliasString(key))
  const otherParams = keyVals.filter(([key]) => !isAliasString(key))

  const newKeyVals = aliasParams.reduce((accObj: Record<string, unknown>, [alias, params]) => {
    accObj = { ...accObj, ...buildNodeElements(alias, params, fragments, functionNames) }
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
  fragments: Fragments,
  functionNames: string[]
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

  if (functionNames.includes(aliasName)) {
    if (Array.isArray(params)) return { operator: aliasName, args: params }
    if (isObject(params)) {
      if ('input' in params || 'args' in params) return { operator: aliasName, ...params }
      return { operator: aliasName, input: params }
    }
    return { operator: aliasName, args: [params] }
  }

  return { [alias]: params }
}
