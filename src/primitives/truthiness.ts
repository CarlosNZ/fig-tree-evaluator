/**
 * FigTree truthiness — the single falsy test ("Truthiness" in
 * docs-dev/v3-specs/v3-api.md, "Truthiness is one function" in
 * docs-dev/v3-specs/v3-implementation-notes.md). Falsy is EXACTLY `false`,
 * `null`, `0`, `""`; everything else — including `[]` and `{}` — is truthy.
 * Consumed by `if.condition`, `and`/`or`/`not`, the predicate iterators, and
 * `convert to:'boolean'` (after its `"true"`/`"false"` carve-out).
 *
 * NOTE: `firstOf` deliberately does NOT use this — it skips `null` only.
 *
 * The empty-container ruling is open for revisiting; keeping the falsy set as
 * one constant here makes that a one-line change applied at every site.
 */
const FALSY: readonly unknown[] = [false, null, 0, '']

export const isTruthy = (value: unknown): boolean => FALSY.indexOf(value) === -1
