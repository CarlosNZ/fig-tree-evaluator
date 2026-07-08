/**
 * The one stringification table ("Stringification: one rendering table" in
 * docs-dev/v3-specs/v3-api.md, "Text rendering is one function" in
 * docs-dev/v3-specs/v3-implementation-notes.md). Used by render positions —
 * `buildString`, `join`, `match` key comparison, and the scalar rows of
 * `convert to:'string'` (Phase 4+). Total; never throws.
 *
 *   string   -> itself
 *   number   -> String(n)      (decimal form)
 *   boolean  -> "true" / "false"
 *   null     -> ""
 *   array    -> ARRAY placeholder
 *   object   -> OBJECT placeholder  (also any opaque constant)
 *
 * Composites render a self-signaling placeholder — never v2's
 * "[object Object]", never a silent "". `convert to:'string'` diverges
 * (propagate null, FAIL on composites); that fork lives in `convert`
 * (Phase 4.2), not here, so this stays total and dependency-free.
 */

/** Placeholder emitted when an array reaches a rendering position. */
export const ARRAY = '<array>'
/**
 * Placeholder emitted when an object (or opaque constant) reaches a rendering
 * position.
 */
export const OBJECT = '<object>'

export const renderText = (value: unknown): string => {
  if (value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return ARRAY
  return OBJECT
}
