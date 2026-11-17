/**
 * FigTree truthiness — the single falsy test ("Truthiness" in
 * docs-dev/v3-specs/v3-api.md, "Truthiness is one function" in
 * docs-dev/v3-specs/v3-implementation-notes.md). Falsy is EXACTLY `false`,
 * `null`, `undefined`, `0`, `""`, `NaN` and `0n`; everything else —
 * including `[]` and `{}` — is truthy. `undefined`, `NaN` and `0n` are
 * outside the value domain: the engine reads a stored `undefined` as
 * `null`, so only a host calling this export passes one, and `NaN` and `0n`
 * can arrive from host data, where JS reads both as falsy.
 * Consumed by `if.condition`, `and`/`or`/`not`, the predicate iterators, and
 * `convert to:'boolean'` (after its `"true"`/`"false"` carve-out).
 *
 * NOTE: `firstNonNull` deliberately does NOT use this — it skips `null` only.
 *
 * The empty-container ruling is open for revisiting; keeping the falsy set as
 * one constant here makes that a one-line change applied at every site.
 */
// A Set matches by SameValueZero, so NaN finds NaN and -0 finds 0
const FALSY: ReadonlySet<unknown> = new Set([false, null, undefined, 0, '', NaN, 0n])

export const isTruthy = (value: unknown): boolean => !FALSY.has(value)
