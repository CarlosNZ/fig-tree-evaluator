/*
The package's own operator definitions, as the checks see them: the core and
I/O operators, as authored.

The package builds them with `buildOperator`, which skips
`defineOperator()`'s checks; codegen/checkDefinitions.ts and
test/package-definitions.test.ts run each through `defineOperator()`
instead.
*/
import type { OperatorDefinition } from '../src/operatorDefinition'
import { coreDefinitions } from '../src/operators'
import { graphQLDefinition, httpDefinition, sqlDefinition } from '../src/operators/io'
import type { HttpClient, SqlConnection } from '../src/types'

// The I/O definitions close over a client; nothing here ever calls it
const client: HttpClient = { request: async () => null }
const connection: SqlConnection = { query: async () => [] }

/** Every definition the package ships: the core set, then the I/O three. */
export const packageDefinitions = (): OperatorDefinition[] => [
  ...coreDefinitions,
  httpDefinition(client),
  graphQLDefinition(client),
  sqlDefinition(connection),
]
