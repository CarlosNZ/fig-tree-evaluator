/**
 * The one ordering relation ("No implicit coercion" in
 * docs-dev/v3-specs/v3-api.md, "Ordering is one comparator" in
 * docs-dev/v3-specs/v3-implementation-notes.md). Backs `<`, `<=`, `>`, `>=`
 * (parameterized by direction + inclusivity, Phase 4) and `min`/`max` (a fold,
 * Phase 4). Operands are assumed HOMOGENEOUS number|string: the `homogeneous`
 * constraint and the engine's finite-number guard bar anything else upstream,
 * so this primitive does not re-check types.
 *
 * Strings compare in true Unicode CODE-POINT order — not JS `<`, which is
 * UTF-16 code-unit order (they differ only for astral characters).
 * Deterministic and locale-independent, since config files travel.
 */
export const compareValues = (a: number | string, b: number | string): -1 | 0 | 1 => {
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0
  }
  return compareByCodePoint(String(a), String(b))
}

const compareByCodePoint = (a: string, b: string): -1 | 0 | 1 => {
  const ca = Array.from(a)
  const cb = Array.from(b)
  const shared = Math.min(ca.length, cb.length)
  for (let i = 0; i < shared; i++) {
    const pa = ca[i].codePointAt(0) as number
    const pb = cb[i].codePointAt(0) as number
    if (pa !== pb) return pa < pb ? -1 : 1
  }
  if (ca.length === cb.length) return 0
  return ca.length < cb.length ? -1 : 1
}
