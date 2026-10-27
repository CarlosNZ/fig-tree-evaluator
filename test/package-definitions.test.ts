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
 * derived field included. The `…Default` naming family, which
 * `defineOperator()` leaves to hosts, is checked here over the package's
 * definitions too. codegen/checkDefinitions.ts repeats both checks in
 * `pnpm build`, which is what `prepublishOnly` runs.
 */
import { defineOperator } from '../src'
import { buildOperator } from '../src/buildOperator'
import { coreDefinitions, coreOperators } from '../src/operators'
import { graphQLDefinition, httpDefinition, sqlDefinition } from '../src/operators/io'
import { MockHttpClient, MockSqlConnection } from './helpers'
import { validDefinition } from './fixtures/operatorDefinitions'
import { defaultFamilyIssues } from '../codegen/defaultFamily'
import { packageDefinitions } from '../codegen/packageDefinitions'

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

describe('the `…Default` naming family', () => {
  test.each(packageDefinitions().map((definition) => [definition.name, definition] as const))(
    '%s declares every family-named parameter lazy',
    (_, definition) => {
      expect(defaultFamilyIssues(definition)).toEqual([])
    }
  )

  test('flags a family-named parameter left in eager delivery', () => {
    const definition = validDefinition()
    definition.parameters = {
      value: { type: ['number', 'null'] },
      nullValueDefault: { type: 'number', required: false },
    }
    expect(defaultFamilyIssues(definition)).toEqual([
      expect.stringMatching(/'nullValueDefault'.*must declare evaluationMode: 'lazy'/),
    ])
  })

  test('accepts a body-read family member — lazy, no replacesNullAt', () => {
    const definition = validDefinition()
    definition.parameters = {
      value: { type: 'number' },
      noMatchDefault: { type: 'any', required: false, evaluationMode: 'lazy' },
    }
    expect(defaultFamilyIssues(definition)).toEqual([])
  })

  test('leaves the bare word `default` outside the pattern (match.default)', () => {
    const definition = validDefinition()
    definition.parameters = { value: { type: 'any' }, default: { type: 'any' } }
    expect(defaultFamilyIssues(definition)).toEqual([])
  })
})
