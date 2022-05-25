import { evaluateArray } from './_helpers'
import { EvaluatorNode, BaseOperatorNode, EvaluatorOptions, OperatorNode } from '../types'
import { EvaluatorInput } from '../evaluateExpression'

const requiredProperties = ['values']
const operatorAliases = ['and', '&', '&&']
const propertyAliases = {}
export interface BasicExtendedNode extends BaseOperatorNode {
  values: EvaluatorNode[]
}

const evaluate = async ({
  expression,
  options,
  operators,
  operatorAliases,
}: EvaluatorInput): Promise<Boolean> => {
  const values = (await evaluateArray(expression.values, options)) as boolean[]
  return values.reduce((acc: boolean, val: boolean) => acc && (val as boolean), true)
}

export const parseChildren = (expression: OperatorNode): BasicExtendedNode => {
  const values = expression.children as EvaluatorNode[]
  return { ...expression, values }
}

export const AND = { requiredProperties, operatorAliases, propertyAliases, evaluate, parseChildren }
