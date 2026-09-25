/**
 * The accepted result, `differential/baseline.json` ("The baseline" in
 * docs-dev/v3-specs/v3-converter.md): the v2 version, the totals, and one
 * line per case with its status and issue codes, so the file's diff says
 * which cases moved even where the totals stay level.
 */
import type { CaseResult, Status } from './run'

interface Baseline {
  v2: string
  totals: { cases: number } & Record<Status, number>
  cases: Record<string, string>
}

/** A case's line: its status, then its issue codes, sorted, each once */
const line = ({ status, issues }: CaseResult) =>
  [status, ...[...new Set(issues.map((issue) => issue.code))].sort()].join(' ')

export const renderBaseline = (results: CaseResult[], version: string): string => {
  const count = (status: Status) => results.filter((result) => result.status === status).length
  const baseline: Baseline = {
    v2: version,
    totals: { cases: results.length, '✓': count('✓'), '⚠': count('⚠'), '✗': count('✗') },
    cases: Object.fromEntries(results.map((result) => [String(result.entry.id), line(result)])),
  }
  return `${JSON.stringify(baseline, null, 2)}\n`
}

/**
 * What moved from the accepted baseline, in either direction: a case that
 * got better fails the check too, until it is accepted, so the baseline
 * stays true
 */
export const checkBaseline = (
  accepted: string,
  results: CaseResult[],
  version: string
): string[] => {
  const baseline = JSON.parse(accepted) as Baseline
  const now = new Map(results.map((result) => [String(result.entry.id), line(result)]))
  const ids = [...new Set([...Object.keys(baseline.cases), ...now.keys()])].sort(
    (a, b) => Number(a) - Number(b)
  )
  return [
    ...(baseline.v2 === version ? [] : [`v2 ${baseline.v2} → ${version}`]),
    ...ids
      .filter((id) => baseline.cases[id] !== now.get(id))
      .map((id) => `#${id}  ${baseline.cases[id] ?? '(no case)'} → ${now.get(id) ?? '(no case)'}`),
  ]
}
