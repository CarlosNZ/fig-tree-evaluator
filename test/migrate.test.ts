/**
 * Phase 15.1 — `./migrate` ("`./migrate` — the module surface" in
 * docs-dev/v3-specs/v3-migration.md).
 *
 * TO-DO: the conversion tests, with the converter. These cover the
 * subpath's surface and the placeholder standing in for it.
 */
import type { MigrationResult } from '../src'
import * as migrate from '../src/migrate'
import { migrateV2Expression } from '../src/migrate'

test('the subpath exports migrateV2Expression and nothing else', () => {
  expect(Object.keys(migrate)).toEqual(['migrateV2Expression'])
})

test('the placeholder returns its input unconverted, and says so', () => {
  const expression = { operator: '+', values: [1, 2] }
  const result: MigrationResult = migrateV2Expression(expression)
  expect(result.expression).toBe(expression)
  expect(result.issues).toEqual([
    { tag: 'non-convertible', path: [], message: expect.stringContaining('placeholder') },
  ])
})
