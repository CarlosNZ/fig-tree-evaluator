import extractProperty from 'object-property-extractor'
import { evaluateArray } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  EvaluatorConfig,
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
  config: EvaluatorConfig
): Promise<EvaluatorOutput> => {
  const [functionPath, ...args] = (await evaluateArray(
    [expression.functionPath, ...(expression.args || [])],
    config
  )) as [string, EvaluatorNode[]]

  config.typeChecker({ name: 'functionPath', value: functionPath, expectedType: 'string' })

  const { objects, functions } = config.options
  const func = (extractProperty(functions, functionPath, null) ??
    extractProperty(objects, functionPath)) as Function
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
