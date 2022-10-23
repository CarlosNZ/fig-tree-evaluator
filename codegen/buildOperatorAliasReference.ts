/*
This automates the process of building the operatorAliases map. We could
generate it each time at runtime, but since it's a fixed reference it makes
sense to create it once and save the result.
This script runs automatically before the build script runs.
*/

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