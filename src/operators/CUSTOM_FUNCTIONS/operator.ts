import extractProperty from 'object-property-extractor'
import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [functionPath, args = [], useCache] = (await evaluateArray(
    [expression.functionPath, expression.args, expression.useCache],
    config
  )) as [string, EvaluatorNode[], boolean]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { functionPath, args }))

  const { data, functions } = config.options
  const func =
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

  const result = await config.cache.useCache(
    shouldUseCache,
    async (_: string, ...args: unknown[]) => {
      return await func(...args)
    },
    functionPath,
    ...args
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
