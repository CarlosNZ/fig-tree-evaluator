import extractProperty from 'object-property-extractor'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../../types'
import operatorData, { requiredProperties, propertyAliases } from './data'

export type FunctionNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & { args: EvaluatorNode[] }

const evaluate = async (
  expression: FunctionNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  const [functionPath, ...args] = (await evaluateArray(
    [expression.functionPath, ...(expression.args || [])],
    config
  )) as [string, EvaluatorNode[]]

  config.typeChecker(...getTypeCheckInput(operatorData.parameters, { functionPath, args }))

  const { data, functions } = config.options
  const func =
    extractProperty(functions, functionPath, null) ??
    // Functions should always be referenced relative to the "functions"
    // parameter in options. However, for backwards compatibility, we also check
    // the "objects" path and paths that include the term "functions" itself.
    // This is not documented as we don't want to perpetuate it, it's purely to
    // ensure backwards compatibility.
    extractProperty(data, functionPath, null) ??
    extractProperty(config.options, functionPath)

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? false

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

const parseChildren = (expression: CombinedOperatorNode): FunctionNode => {
  const [functionPath, ...args] = expression.children as EvaluatorNode[]
  return { ...expression, functionPath, args }
}

export const CUSTOM_FUNCTIONS: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}
