import { writeFileSync } from 'fs'
import * as operatorList from '../src/operators'
import { Operators, Operator, OperatorObject, OperatorReference } from '../src/types'

const operatorReference: OperatorReference = Object.fromEntries(
  Operators.map((operator) => [operator, operatorList[operator]])
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
