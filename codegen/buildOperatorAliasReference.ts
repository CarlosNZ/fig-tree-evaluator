/*
This automates the process of building the operatorAliases map. We could
generate it each time at runtime, but since it's a fixed reference it makes
sense to save it as a static list.

This script runs automatically before the build script runs (or run manually
with `yarn generate`).

Result is saved to `v2-src/operators/operatorAliases.ts`

NOTE (v3): this is v2-only tooling — v3 deletes the alias machinery (see
docs-dev/v3-specs/v3-implementation-plan.md Phase 0). It reads and writes the
frozen v2 engine in /v2-src so the v2 engine stays coherent; it is no longer
part of the v3 `prebuild`.
*/

import { writeFileSync } from 'fs'
import prettier, { RequiredOptions } from 'prettier'
import prettierConfig from '../.prettierrc'
import * as operatorList from '../v2-src/operators'
import { Operators, Operator, OperatorObject, OperatorReference } from '../v2-src/types'

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

prettier
  .format(
    "import { OperatorAliases } from '../types'\n\nexport const operatorAliases: OperatorAliases = " +
      JSON.stringify(operatorAliases, null, 2),
    { parser: 'babel-ts', ...prettierConfig } as Partial<RequiredOptions>
  )
  .then((data) => writeFileSync('v2-src/operators/operatorAliases.ts', data))
