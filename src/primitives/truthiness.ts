/**
 * FigTree truthiness — the single falsy test ("Truthiness" in
 * docs-dev/v3-specs/v3-api.md, "Truthiness is one function" in
 * docs-dev/v3-specs/v3-implementation-notes.md). Falsy is EXACTLY `false`,
 * `null`, `0`, `""` and `NaN`; everything else — including `[]` and `{}` — is
 * truthy. `NaN` is outside the value domain but can arrive from host data,
 * where it means "no number", as it does in JS.
 * Consumed by `if.condition`, `and`/`or`/`not`, the predicate iterators, and
 * `convert to:'boolean'` (after its `"true"`/`"false"` carve-out).
 *
 * NOTE: `firstNonNull` deliberately does NOT use this — it skips `null` only.
 *
 * The empty-container ruling is open for revisiting; keeping the falsy set as
 * one constant here makes that a one-line change applied at every site.
 */
const FALSY: readonly unknown[] = [false, null, 0, '']

// `indexOf` matches by `===`, which never matches NaN
export const isTruthy = (value: unknown): boolean =>
  FALSY.indexOf(value) === -1 && !Number.isNaN(value)
