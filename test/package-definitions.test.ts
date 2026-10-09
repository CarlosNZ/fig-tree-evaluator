/**
 * Phase 14 — the package's own definitions ("Ruling: the definition checks
 * shake off; the compiler stays" in docs-dev/v3-specs/v3-packaging.md).
 *
 * The core and I/O operators are built by `buildOperator`, which skips
 * `defineOperator()`'s checks so that a bundle importing only `FigTree` and
 * `coreOperators` never carries them. This file is where those definitions
 * are checked instead: each literal as authored, with its `./editor-hints`
 * text put back (codegen/packageDefinitions.ts), goes through
 * `defineOperator()`, which throws on any violation, and the artifact the
 * package ships must equal what that produces — fingerprint and every
 * derived field included — less the text, which it leaves to
 * `./editor-hints`. codegen/checkDefinitions.ts repeats the checks in
 * `pnpm build`, which is what `prepublishOnly` runs.
 */
import { defineOperator } from '../src'
import { buildOperator } from '../src/buildOperator'
import { coreDefinitions, coreOperators } from '../src/operators'
import { graphQLDefinition, httpDefinition, sqlDefinition } from '../src/operators/io'
import { withHintText } from '../codegen/packageDefinitions'
import { MockHttpClient, MockSqlConnection } from './helpers'

/**
 * A copy with every `description` key dropped, wherever it sits: the
 * resolution plan holds the same parameter objects as `parameters`.
 */
const withoutText = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutText)
  if (value === null || typeof value !== 'object') return value
  const copy: Record<string | symbol, unknown> = {}
  for (const key of Reflect.ownKeys(value))
    if (key !== 'description')
      copy[key] = withoutText((value as Record<string | symbol, unknown>)[key])
  return copy
}

describe('core definitions', () => {
  test('one built artifact per authored definition, in the same order', () => {
    expect(coreOperators).toHaveLength(coreDefinitions.length)
    expect(coreOperators.map((op) => op.name)).toEqual(coreDefinitions.map((d) => d.name))
  })

  test.each(coreDefinitions.map((definition, i) => [definition.name, definition, i] as const))(
    '%s passes the checks and ships what defineOperator() builds, less its text',
    (_, definition, i) => {
      const checked = defineOperator(withHintText(definition))
      expect(withoutText(coreOperators[i])).toStrictEqual(withoutText(checked))
    }
  )

  test('the shipped artifacts carry no description, which ./editor-hints holds', () => {
    for (const op of coreOperators) expect(JSON.stringify(op)).not.toContain('"description"')
  })
})

describe('I/O definitions', () => {
  const client = new MockHttpClient()
  const connection = new MockSqlConnection()

  test.each([
    ['http', httpDefinition(client)],
    ['graphQL', graphQLDefinition(client)],
    ['sql', sqlDefinition(connection)],
  ] as const)(
    '%s passes the checks and builds what defineOperator() builds, less its text',
    (_, definition) => {
      const built = buildOperator(definition)
      expect(JSON.stringify(built)).not.toContain('"description"')
      expect(withoutText(built)).toStrictEqual(
        withoutText(defineOperator(withHintText(definition)))
      )
    }
  )
})
