/**
 * Phase 14 — the package's own definitions ("Ruling: the definition checks
 * shake off; the compiler stays" in docs-dev/v3-specs/v3-packaging.md).
 *
 * The core and I/O operators are built by `buildOperator`, which skips
 * `defineOperator()`'s checks so that a bundle importing only `FigTree` and
 * `coreOperators` never carries them. This file is where those definitions
 * are checked instead: each literal as authored goes through
 * `defineOperator()`, which throws on any violation, and the artifact the
 * package ships must equal what that produces — fingerprint and every
 * derived field included. codegen/checkDefinitions.ts repeats the checks in
 * `pnpm build`, which is what `prepublishOnly` runs.
 */
import { defineOperator } from '../src'
import { buildOperator } from '../src/buildOperator'
import { coreDefinitions, coreOperators } from '../src/operators'
import { graphQLDefinition, httpDefinition, sqlDefinition } from '../src/operators/io'
import { MockHttpClient, MockSqlConnection } from './helpers'

describe('core definitions', () => {
  test('one built artifact per authored definition, in the same order', () => {
    expect(coreOperators).toHaveLength(coreDefinitions.length)
    expect(coreOperators.map((op) => op.name)).toEqual(coreDefinitions.map((d) => d.name))
  })

  test.each(coreDefinitions.map((definition, i) => [definition.name, definition, i] as const))(
    '%s passes the checks and ships what defineOperator() builds',
    (_, definition, i) => {
      expect(coreOperators[i]).toStrictEqual(defineOperator(definition))
    }
  )
})

describe('I/O definitions', () => {
  const client = new MockHttpClient()
  const connection = new MockSqlConnection()

  test.each([
    ['http', httpDefinition(client)],
    ['graphQL', graphQLDefinition(client)],
    ['sql', sqlDefinition(connection)],
  ] as const)('%s passes the checks and builds what defineOperator() builds', (_, definition) => {
    expect(buildOperator(definition)).toStrictEqual(defineOperator(definition))
  })
})
