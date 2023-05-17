/*
This automates the process of building the operatorAliases map. We could
generate it each time at runtime, but since it's a fixed reference it makes
sense to save it as a static list.

This script runs automatically before the build script runs (or run manually
with `yarn generate`).

Result is saved to `src/operators/operatorAliases.ts`
*/

import { writeFileSync } from 'fs'
import prettier, { RequiredOptions } from 'prettier'
import prettierConfig from '../.prettierrc'
import * as operatorList from '../src/operators'
import { Operators, Operator, OperatorObject, OperatorReference } from '../src/types'

const operatorReference: OperatorReference = Object.fromEntries(
  Operators.map((operator) => [operator, operatorList[operator]])
) as { [key in Operator]: OperatorObject }

const buildOperatorAliases = (operatorObjects: { [key in Operator]: OperatorObject }) => {
  const operatorAliases: { [key: string]: Operator } = {}
  Object.entries(operatorObjects).forEach(
    ([
      operator,
      {
        operatorData: { aliases },
      },
    ]) => {
      aliases.forEach((alias) => (operatorAliases[alias] = operator as Operator))
    }
  )
  return operatorAliases
}

console.log('Building Operator aliases...\n')
const operatorAliases = buildOperatorAliases(operatorReference)

writeFileSync(
  'src/operators/operatorAliases.ts',
  prettier.format(
    "import { OperatorAliases } from '../types'\n\nexport const operatorAliases: OperatorAliases = " +
      JSON.stringify(operatorAliases, null, 2),
    { parser: 'babel', ...prettierConfig } as Partial<RequiredOptions>
  )
)
