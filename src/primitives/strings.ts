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
 * Segment a string into Unicode CODE POINTS (never UTF-16 units — never tears a
 * surrogate pair). Backs `split('')` and `length` on strings. Grapheme clusters
 * are out of scope (that would be `Intl.Segmenter`, in one place).
 */
export const toCodePoints = (value: string): string[] => Array.from(value)
