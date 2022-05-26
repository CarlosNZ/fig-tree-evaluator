import extractProperty from 'object-property-extractor'
import { evaluateArray } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  ValueNode,
  EvaluatorConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['functionPath'] as const
const operatorAliases = ['objectFunctions', 'function', 'functions', 'runFunction']
const propertyAliases = { functionsPath: 'functionPath', arguments: 'args', variables: 'args' }

export type ObjFuncNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & { args: EvaluatorNode[] }

const evaluate = async (expression: ObjFuncNode, config: EvaluatorConfig): Promise<ValueNode> => {
  const [functionPath, ...args] = (await evaluateArray(
    [expression.functionPath, ...(expression.args as EvaluatorNode[])],
    config
  )) as [string, EvaluatorNode[]]

  const inputObject = config.options?.objects ?? {}
  const func = extractProperty(inputObject, functionPath) as Function
  return await func(...args)
}

const parseChildren = (expression: CombinedOperatorNode): ObjFuncNode => {
  const [functionPath, ...args] = expression.children as EvaluatorNode[]
  return { ...expression, functionPath, args }
}

export const OBJECT_FUNCTIONS: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}
