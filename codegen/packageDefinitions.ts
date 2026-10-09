/*
The package's own operator definitions, as the checks see them: the core and
I/O operators, each with its display text from `./editor-hints` put back.

The definitions carry no `description`, operator or parameter: that text
lives in `operatorHints`, so a host that never shows it never ships it, and
`withDescriptions` joins it back into `getOperators()`. `defineOperator()`
requires a description, so the checks (codegen/checkDefinitions.ts,
test/package-definitions.test.ts) run each definition with its text
restored, and test/editor-hints.test.ts compares the joined snapshot
against the one these produce.
*/
import type { PackageDefinition } from '../src/buildOperator'
import { operatorHints } from '../src/editor-hints'
import type { OperatorDefinition, ParameterDeclaration } from '../src/operatorDefinition'
import { coreDefinitions } from '../src/operators'
import { graphQLDefinition, httpDefinition, sqlDefinition } from '../src/operators/io'
import type { HttpClient, SqlConnection } from '../src/types'

// The I/O definitions close over a client; nothing here ever calls it
const client: HttpClient = { request: async () => null }
const connection: SqlConnection = { query: async () => [] }

/** Every definition the package ships: the core set, then the I/O three. */
export const packageDefinitions = (): PackageDefinition[] => [
  ...coreDefinitions,
  httpDefinition(client),
  graphQLDefinition(client),
  sqlDefinition(connection),
]

/**
 * A package definition with its `operatorHints` text in place. A missing
 * operator description becomes the empty string, which `defineOperator()`
 * refuses by name.
 */
export const withHintText = (definition: PackageDefinition): OperatorDefinition => {
  const hints = operatorHints[definition.name]
  const parameters: Record<string, ParameterDeclaration> = {}
  for (const [name, declaration] of Object.entries(definition.parameters)) {
    const description = hints?.parameterDescriptions?.[name]
    parameters[name] = description === undefined ? declaration : { ...declaration, description }
  }
  return { ...definition, description: hints?.description ?? '', parameters } as OperatorDefinition
}
