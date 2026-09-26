/**
 * v2's operator-name rule ("The name rule" in
 * docs-dev/v3-specs/v3-converter.md). v2 camel-cased a name before looking
 * it up, so `'Plus'`, `'NOT_EQUAL'` and `'get_data'` all resolve. The rule is
 * behaviour, not data, and names are open-ended strings, so the converter
 * restates it: `standardiseOperatorName` and `camelCase` in v2's helpers.ts.
 * test/migrate-table.test.ts holds it to the v2 package's own function.
 * Beside it, v2's tests for an alias and for a node, which the stages share.
 */
import type { PlainObject } from '../v3Values'
import { V2_NAMES, type V2Operator } from './operators.generated'

/** v2's test for an alias: a `$` and at least one more character */
export const isAlias = (key: string) => /^\$.+/.test(key)

/** Whether an object is a v2 node: an operator node or a fragment call */
export const hasNodeKey = (object: PlainObject) =>
  Object.hasOwn(object, 'operator') || Object.hasOwn(object, 'fragment')

/**
 * v2's camel-casing: characters other than letters, digits, spaces, `_` and
 * `-` are removed, the rest split into words at spaces, `_`, `-` and case
 * changes, and the words joined with the first lower-cased and the others
 * capitalized. A word that mixes letters and digits keeps only its letters,
 * as v2's word pattern matched them.
 */
const camelCase = (name: string): string =>
  name
    .replace(/[^A-Za-z\d _-]/g, '')
    .split(/[-_ ]/)
    .flatMap((word) => word.match(/[a-z]+|[A-Z]+[a-z]*/g) ?? word)
    .filter((word) => word !== '')
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('')

/**
 * A name as v2 standardized it. One that camel-cases to nothing, such as `+`
 * or `?`, is kept as it is, since stand-alone punctuation can be a name.
 */
export const standardiseV2Name = (name: string): string => camelCase(name) || name

/** The v2 operator a name resolved to, or `undefined` if none. */
export const v2OperatorFor = (name: string): V2Operator | undefined => {
  const standardised = standardiseV2Name(name)
  return Object.hasOwn(V2_NAMES, standardised) ? V2_NAMES[standardised] : undefined
}
