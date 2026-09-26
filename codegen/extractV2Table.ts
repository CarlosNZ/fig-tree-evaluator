/*
Writes the v2 converter's two generated tables (codegen/migrateTables.ts):

- src/migrate/v2/operators.generated.ts, from the published v2 package, the
  devDependency `fig-tree-evaluator-v2`;
- src/migrate/v3Names.generated.ts, from the core and I/O operators'
  definitions.

Run it with `pnpm extractV2Table` after bumping the v2 package or renaming or
re-aliasing a core operator; test/migrate-table.test.ts fails until it has
run. Both are written in Prettier's format, so `pnpm format:check` covers
them as they are.
*/
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { format, resolveConfig } from 'prettier'
import { coreDefinitions } from '../src/operators'
import { graphQLDefinition, httpDefinition, sqlDefinition } from '../src/operators/io'
import type { HttpClient, SqlConnection } from '../src/types'
import { extractV2Table, extractV3Names, renderV2Table, renderV3Names } from './migrateTables'

// The package's ESM build has no `"type": "module"` to declare it, so tsx
// loads it as CommonJS and its named exports arrive under `default`. The
// CommonJS build is the one Jest loads, so the script and the tests read the
// same code.
const { FigTreeEvaluator } = createRequire(import.meta.url)(
  'fig-tree-evaluator-v2'
) as typeof import('fig-tree-evaluator-v2')

// The I/O definitions close over a client; only their names are read
const client: HttpClient = { request: async () => null }
const connection: SqlConnection = { query: async () => [] }

const write = async (path: string, source: string) => {
  const options = await resolveConfig(path)
  writeFileSync(path, await format(source, { ...options, filepath: path }))
  console.log('Wrote', path)
}

const v2 = new FigTreeEvaluator()
const v2Table = extractV2Table(v2.getOperators(), v2.getVersion())
await write('src/migrate/v2/operators.generated.ts', renderV2Table(v2Table))

const v3Names = extractV3Names([
  ...coreDefinitions,
  httpDefinition(client),
  graphQLDefinition(client),
  sqlDefinition(connection),
])
await write('src/migrate/v3Names.generated.ts', renderV3Names(v3Names))
