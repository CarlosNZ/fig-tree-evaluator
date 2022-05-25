import { writeFileSync } from 'fs'
import * as operatorList from '../src/operators'
import {
  operators,
  Operator,
  BaseOperatorNode,
  ValueNode,
  OperatorNode,
  EvaluatorOptions,
} from '../src/types'

type OperatorObject = {
  requiredProperties: string[]
  operatorAliases: string[]
  propertyAliases: { [key: string]: string } // Can we specify "string"?
  evaluate: (expression: BaseOperatorNode, options: EvaluatorOptions) => ValueNode
  parseChildren: (expression: OperatorNode) => OperatorNode
}

type OperatorRef = { [key in Operator]: OperatorObject }

const operatorReference: { [key in Operator]: OperatorObject } = Object.fromEntries(
  operators.map((operator) => [operator, operatorList[operator] as any]) //FIX ANY
) as { [key in Operator]: OperatorObject }

const buildOperatorAliases = (operatorObjects: { [key in Operator]: OperatorObject }) => {
  const aliases: { [key: string]: Operator } = {}
  Object.entries(operatorObjects).forEach(([operator, { operatorAliases }]) => {
    operatorAliases.forEach((alias) => (aliases[alias] = operator as Operator))
  })
  return aliases
}

console.log('Building Operator aliases...\n')
const operatorAliases = buildOperatorAliases(operatorReference)

writeFileSync('src/operators/_operatorAliases.json', JSON.stringify(operatorAliases, null, 2))
