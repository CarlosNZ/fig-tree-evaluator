/**
 * Shared string primitives ("String primitives are shared functions too" in
 * docs-dev/v3-specs/v3-implementation-notes.md).
 */

/**
 * Strip whitespace from both ends, over the JS `String.prototype.trim` set
 * (WhiteSpace + line terminators). The single trim used by the `trim` operator,
 * `split`'s per-element trim, and `buildString`'s per-value trim — refining the
 * set later moves every site together. (No `trimStart`/`trimEnd` until earned.)
 */
export const trim = (value: string): string => value.trim()

/**
 * The same set again, as the two one-sided run strippers `buildString`'s
 * `closeGaps` consumes: an empty render takes the maximal whitespace run
 * immediately before it, or the one after where there is none. `\s` is
 * defined as WhiteSpace plus LineTerminator — exactly what `trim` above
 * strips — so line terminators close line-shaped gaps as spaces close
 * word-shaped ones, and all three sites move together.
 */
const TRAILING_RUN = /\s+$/
const LEADING_RUN = /^\s+/

export const stripTrailingRun = (value: string): string => value.replace(TRAILING_RUN, '')
export const stripLeadingRun = (value: string): string => value.replace(LEADING_RUN, '')

/**
 * Segment a string into Unicode CODE POINTS (never UTF-16 units — never tears a
 * surrogate pair). Backs `split('')` and `length` on strings. Grapheme clusters
 * are out of scope (that would be `Intl.Segmenter`, in one place).
 */
export const toCodePoints = (value: string): string[] => Array.from(value)
