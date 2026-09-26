/**
 * Phase 15.1 — the `./migrate` surface ("Surface" and "Packaging" in
 * docs-dev/v3-specs/v3-converter.md).
 *
 * The subpath exports its two functions and nothing else, and the four
 * conversion types export from the root. test/exports.test.ts lists values
 * only, so the types are checked here, where `pnpm typecheck` fails if one
 * goes missing.
 */
import type { FragmentMigrationResult, MigrationIssue, MigrationResult, V2Options } from '../src'
import * as migrate from '../src/migrate'
import { migrateV2Expression, migrateV2Fragments } from '../src/migrate'

test('the subpath exports migrateV2Expression and migrateV2Fragments, and nothing else', () => {
  expect(Object.keys(migrate).sort()).toEqual(['migrateV2Expression', 'migrateV2Fragments'])
})

test('migrateV2Expression converts an expression, its options optional', () => {
  const result: MigrationResult = migrateV2Expression({ operator: '+', values: [1, 2] })
  expect(result).toEqual({ expression: { operator: 'plus', values: [1, 2] }, issues: [] })
})

test('migrateV2Fragments converts the definitions in its options', () => {
  const options: V2Options = { fragments: { adder: { operator: '+', values: '$values' } } }
  const result: FragmentMigrationResult = migrateV2Fragments(options)
  expect(result).toEqual({
    fragments: {
      adder: {
        expression: { operator: 'plus', values: '$params.values' },
        parameters: { values: { type: 'any', default: '$values' } },
      },
    },
    issues: [],
  })
})

test('an issue carries its code, tag, path and message', () => {
  const [issue]: MigrationIssue[] = migrateV2Expression({ operator: '>', values: [3, 2, 1] }).issues
  expect(issue).toEqual({
    code: 'values-cut',
    tag: 'lossy-default',
    path: ['values'],
    message: 'v2 used the first two values and ignored the rest. Removed: 1.',
  })
})
