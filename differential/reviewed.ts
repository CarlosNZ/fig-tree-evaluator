/**
 * The review map ("Comparing" in docs-dev/v3-specs/v3-converter.md): a
 * person's verdict on a case whose outcomes differ with no issue to
 * explain it, by the case's id, such as `42: 'guide: no implicit
 * coercion'`. A case here shows as ⚠ with its note. Together, the issues
 * and these notes are the divergence catalogue: the issues are the
 * converter's half, and the notes are the guide's.
 */
export const reviewed: Record<number, string> = {
  143: 'guide: a literal composite substitution is a static error in v3; v2 rendered it joined with commas',
  144: 'guide: a literal composite substitution is a static error in v3; v2 rendered it joined with commas',
  165: 'guide: a literal composite substitution is a static error in v3; v2 rendered it joined with commas',
  166: 'guide: a literal composite substitution is a static error in v3; v2 rendered it joined with commas',
  183: 'guide: a literal composite substitution is a static error in v3; v2 rendered it joined with commas',
  419: 'guide: a literal composite substitution is a static error in v3, bound or not; v2 ignored it, and the expression is refused at the static gate before any branch runs',
  442: 'guide: a literal composite substitution is a static error in v3, bound or not; v2 ignored it, and the expression is refused at the static gate before any branch runs',
}
