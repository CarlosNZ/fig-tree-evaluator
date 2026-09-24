/**
 * Phase 15.1 — `./convert` ("`./convert` — the module surface" in
 * docs-dev/v3-specs/v3-migration.md).
 *
 * TO-DO: the conversion tests, with the converter. These cover the
 * subpath's surface and the placeholder standing in for it.
 */
import type { ConversionResult } from '../src'
import * as convert from '../src/converter'
import { convertV2ToV3 } from '../src/converter'

test('the subpath exports convertV2ToV3 and nothing else', () => {
  expect(Object.keys(convert)).toEqual(['convertV2ToV3'])
})

test('the placeholder returns its input unconverted, and says so', () => {
  const expression = { operator: '+', values: [1, 2] }
  const result: ConversionResult = convertV2ToV3(expression)
  expect(result.expression).toBe(expression)
  expect(result.issues).toEqual([
    { tag: 'non-convertible', path: [], message: expect.stringContaining('placeholder') },
  ])
})
