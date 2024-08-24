import extractProperty from 'object-property-extractor'
import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray, evaluateObject } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [functionPath, args = [], input, useCache] = (await evaluateArray(
    [expression.functionPath, expression.args, expression.input, expression.useCache],
    config
  )) as [string, EvaluatorNode[], unknown, boolean]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { functionPath, args }))

  const { data, functions } = config.options
  if (!functions) throw new Error('- No functions defined')

  const func =
    extractProperty(functions, `${functionPath}.function`, null) ??
    extractProperty(functions, functionPath, null) ??
    // Functions should always be referenced relative to the "functions"
    // parameter in options. However, for backwards compatibility, we also check
    // the "objects" path and paths that include the term "functions" itself.
    // This is not documented as we don't want to perpetuate it, it's purely to
    // ensure backwards compatibility.
    extractProperty(data, functionPath, null) ??
    extractProperty(config.options, functionPath, null)

  if (!func || typeof func !== 'function') throw new Error(`- No function found: "${functionPath}"`)

  const shouldUseCache = useCache ?? config.options.useCache ?? false

  const inputArgs = [
    ...(input === undefined ? [] : [await evaluateObject(input, config)]),
    ...(Array.isArray(args) ? args : [args]),
  ]

  const result = await config.cache.useCache(
    shouldUseCache,
    async (_: string, ...inputArgs: unknown[]) => {
      return await func(...inputArgs)
    },
    functionPath,
    ...inputArgs
  )

  return result
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [functionPath, ...args] = expression.children as EvaluatorNode[]
  return { ...expression, functionPath, args }
}

export const CUSTOM_FUNCTIONS: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
