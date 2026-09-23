/*
Runs the package's own operator definitions — the core operators and the
I/O operators — through `defineOperator()`'s full checks, and fails if any
is malformed.

The package builds these with `buildOperator` (src/buildOperator.ts), which
trusts its input so that a bundle importing only `FigTree` and
`coreOperators` never carries the checks. They are checked here instead, in
`pnpm build` (and so in `prepublishOnly`), and in
test/package-definitions.test.ts, which also holds each built artifact equal
to the checked one.
*/
import { defineOperator } from '../src/defineOperator'
import { coreDefinitions } from '../src/operators'
import { graphQLDefinition, httpDefinition, sqlDefinition } from '../src/operators/io'
import type { HttpClient, SqlConnection } from '../src/types'

// The I/O definitions close over a client; the checks never call it
const client: HttpClient = { request: async () => null }
const connection: SqlConnection = { query: async () => [] }

const definitions = [
  ...coreDefinitions,
  httpDefinition(client),
  graphQLDefinition(client),
  sqlDefinition(connection),
]

for (const definition of definitions) defineOperator(definition)

console.log(`Checked ${definitions.length} package operator definitions`)
