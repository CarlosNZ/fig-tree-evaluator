import extractProperty from 'object-property-extractor'
import { evaluateArray } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['functionPath'] as const
const operatorAliases = [
  'customFunctions',
  'customFunction',
  'objectFunctions',
  'function',
  'functions',
  'runFunction',
]
const propertyAliases = {
  functionsPath: 'functionPath',
  functionName: 'functionPath',
  funcName: 'functionPath',
  path: 'functionPath',
  arguments: 'args',
  variables: 'args',
}

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

  config.typeChecker({ name: 'functionPath', value: functionPath, expectedType: 'string' })

  const { objects, functions } = config.options
  const func = (extractProperty(functions, functionPath, null) ??
    // Functions should always be referenced relative to the "functions"
    // parameter in options. However, for backwards compatibility, we also check
    // the "objects" path and paths that include the term "functions" itself.
    // This is not documented as we don't want to perpetuate it, it's purely to
    // ensure backwards compatibility.
    extractProperty(objects, functionPath, null) ??
    extractProperty(config.options, functionPath)) as Function
  return await func(...args)
}

const parseChildren = (expression: CombinedOperatorNode): FunctionNode => {
  const [functionPath, ...args] = expression.children as EvaluatorNode[]
  return { ...expression, functionPath, args }
}

export const CUSTOM_FUNCTIONS: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
