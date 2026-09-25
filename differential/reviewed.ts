/**
 * The review map ("Comparing" in docs-dev/v3-specs/v3-converter.md): a
 * person's verdict on a case whose outcomes differ with no issue to
 * explain it, by the case's id, such as `42: 'guide: no implicit
 * coercion'`. A case here shows as ⚠ with its note. Together, the issues
 * and these notes are the divergence catalogue: the issues are the
 * converter's half, and the notes are the guide's.
 */
export const reviewed: Record<number, string> = {}
