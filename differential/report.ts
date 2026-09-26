/**
 * What the runner prints ("Output" in docs-dev/v3-specs/v3-converter.md):
 * each ✗ as a block, each ⚠ as a line, each ✓ only when asked, every line
 * cut to about 100 characters, then a summary. A case asked for by id is
 * printed in full instead, untruncated. And the file of every case that
 * differs, which a full run writes.
 */
import type { MigrationIssue } from '../src'
import type { Outcome } from './outcome'
import type { CaseResult, Status } from './run'

const WIDTH = 100

const cut = (text: string, width: number) =>
  text.length <= width ? text : `${text.slice(0, width - 1)}…`

/**
 * JSON, with a function as its source, and `undefined`, `NaN` and the
 * infinities spelt out, since JSON would drop them or write them as `null`
 */
const json = (value: unknown, indent?: number) =>
  JSON.stringify(
    value,
    (_, v: unknown) =>
      typeof v === 'function'
        ? String(v)
        : v === undefined || (typeof v === 'number' && !Number.isFinite(v))
          ? `(${String(v)})`
          : v,
    indent
  ) ?? String(value)

/** An outcome as text: on one line unless indented, where it keeps its lines */
const outcome = (result: Outcome, indent?: number) =>
  'value' in result
    ? json(result.value, indent)
    : `error: ${indent === undefined ? result.error.replace(/\s+/g, ' ') : result.error}`

const codes = (issues: MigrationIssue[]) => [...new Set(issues.map((issue) => issue.code))]

const heading = ({ status, entry }: CaseResult, width = 48) =>
  `${status} #${entry.id}`.padEnd(8) + cut(entry.from, width).padEnd(width)

/** A case as the run prints it: a ✓ only when every case is asked for */
export const caseLines = (result: CaseResult, all: boolean): string[] => {
  if (result.status === '✓')
    return all
      ? [cut(`${heading(result)}  ${codes(result.issues).join(' ')}`.trimEnd(), WIDTH)]
      : []
  if (result.status === '⚠')
    return [cut(`${heading(result)}  ${result.note ?? codes(result.issues).join(' ')}`, WIDTH)]
  const field = (name: string, text: string) => cut(`    ${name.padEnd(12)}${text}`, WIDTH)
  return [
    heading(result, 90).trimEnd(),
    field('expression', json(result.entry.expression)),
    field('v2', outcome(result.v2)),
    field('v3', outcome(result.v3)),
    field('issues', codes(result.issues).join(' ') || '—'),
    ...(result.unanswered ? [field('unanswered', result.unanswered.join('; '))] : []),
    ...(result.requests ? [field('requests', sameOrNot(result.requests))] : []),
  ]
}

const sameOrNot = ({ same }: NonNullable<CaseResult['requests']>) =>
  same ? 'the same from both engines' : 'differ'

/** Lines of items separated by `separator`, none much longer than the width */
const wrap = (prefix: string, items: string[], separator: string) =>
  items.reduce<string[]>(
    (lines, item) => {
      const last = lines[lines.length - 1]
      if (last.length + item.length + separator.length > WIDTH) return [...lines, `  ${item}`]
      lines[lines.length - 1] = last.endsWith(': ') ? last + item : last + separator + item
      return lines
    },
    [prefix]
  )

export const summary = (results: CaseResult[], notes: Iterable<string>): string[] => {
  const count = (status: Status) => results.filter((result) => result.status === status).length
  const raised = new Map<string, number>()
  for (const result of results)
    for (const code of codes(result.issues)) raised.set(code, (raised.get(code) ?? 0) + 1)
  const unexplained = results.filter((result) => result.status === '✗')
  return [
    '',
    `${results.length} cases: ${count('✓')} ✓ · ${count('⚠')} ⚠ · ${count('✗')} ✗`,
    ...wrap(
      'Issues raised: ',
      [...raised].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} ×${n}`),
      ', '
    ),
    ...wrap(
      'Unexplained: ',
      unexplained.map((result) => `#${result.entry.id}`),
      ' '
    ),
    ...[...notes].map((note) => `Not registered in v3: ${note}`),
  ]
}

const path = (issue: MigrationIssue) =>
  issue.path
    .map((key) => (typeof key === 'number' ? `[${key}]` : `.${key}`))
    .join('')
    .slice(1) || '(root)'

const indented = (text: string) => text.split('\n').join('\n    ')

/** A case in full, untruncated, as `pnpm differential 42` prints it */
export const detail = (result: CaseResult): string[] => {
  const { entry } = result
  return [
    `${result.status} #${entry.id}  ${entry.from}`,
    ...(entry.options ? [`  options`, `    ${indented(json(entry.options, 2))}`] : []),
    `  v2 expression`,
    `    ${indented(json(entry.expression, 2))}`,
    `  converted`,
    `    ${indented(json(result.converted, 2))}`,
    `  issues`,
    ...(result.issues.length > 0
      ? result.issues.map(
          (issue) => `    ${issue.code} (${issue.tag}) at ${path(issue)}: ${issue.message}`
        )
      : ['    —']),
    `  v2`,
    `    ${indented(outcome(result.v2, 2))}`,
    `  v3`,
    `    ${indented(outcome(result.v3, 2))}`,
    ...(result.unanswered
      ? ['  unanswered, of v3', ...result.unanswered.map((request) => `    ${request}`)]
      : []),
    ...requestLines(result),
    ...(result.note ? [`  reviewed  ${result.note}`] : []),
    '',
  ]
}

/** What each engine sent: once where the two are the same, else each */
const requestLines = ({ requests }: CaseResult): string[] => {
  if (requests === undefined) return []
  const list = (sent: string[]) => (sent.length > 0 ? sent : ['—']).map((line) => `    ${line}`)
  return requests.same
    ? [`  requests  ${sameOrNot(requests)}`, ...list(requests.v2)]
    : ['  requests, v2', ...list(requests.v2), '  requests, v3', ...list(requests.v3)]
}

/** A JSON block longer than this goes to a file of its own */
const INLINE = 20_000

/**
 * `differential/out/differences.md`, which every full run writes: each
 * case that is not ✓, the unexplained first, with its options, the v2
 * expression, what the converter made of it, what the conversion raised,
 * both outcomes, and any request of v3's no double answered. `files` holds
 * the values too large to read inline, named by case, beside it.
 */
export const renderDifferences = (
  results: CaseResult[],
  version: string
): { markdown: string; files: Record<string, string> } => {
  const files: Record<string, string> = {}
  const count = (status: Status) => results.filter((result) => result.status === status).length
  const differing = [
    ...results.filter((result) => result.status === '✗'),
    ...results.filter((result) => result.status === '⚠'),
  ]

  const block = (id: number, part: string, value: unknown) => {
    const text = json(value, 2)
    if (text.length <= INLINE) return ['```json', text, '```']
    const name = `${id}.${part}.json`
    files[name] = `${text}\n`
    return [
      `Too large to read here (${text.length.toLocaleString('en')} characters): [${name}](${name})`,
    ]
  }
  const outcomeBlock = (engine: string, id: number, result: Outcome) =>
    'value' in result
      ? [`**${engine}**`, '', ...block(id, engine, result.value)]
      : [`**${engine} failed**`, '', '```text', result.error, '```']

  // An issue list too long to read here, as a large expression raises one
  // at each of thousands of nodes, is counted by code, and written whole
  // to a file of its own
  const issueLines = ({ entry, issues }: CaseResult) => {
    if (issues.length === 0) return ['**Issues:** none']
    const lines = issues.map(
      (issue) => `- \`${issue.code}\` (${issue.tag}) at \`${path(issue)}\`: ${issue.message}`
    )
    if (lines.join('\n').length <= INLINE) return ['**Issues**', '', ...lines]
    const name = `${entry.id}.issues.md`
    files[name] = `${lines.join('\n')}\n`
    const counts = new Map<string, number>()
    for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1)
    return [
      `**Issues:** ${issues.length.toLocaleString('en')}, too many to read here: [${name}](${name})`,
      '',
      ...[...counts].map(([code, n]) => `- \`${code}\` ×${n.toLocaleString('en')}`),
    ]
  }

  const section = (result: CaseResult) => {
    const { entry } = result
    return [
      `<a id="case-${entry.id}"></a>`,
      '',
      `## ${result.status} #${entry.id} · ${entry.from}`,
      '',
      ...(entry.options
        ? ['**Options**', '', ...block(entry.id, 'options', entry.options), '']
        : []),
      '**v2 expression**',
      '',
      ...block(entry.id, 'expression', entry.expression),
      '',
      '**Converted to v3**',
      '',
      ...block(entry.id, 'converted', result.converted),
      '',
      ...issueLines(result),
      '',
      ...outcomeBlock('v2', entry.id, result.v2),
      '',
      ...outcomeBlock('v3', entry.id, result.v3),
      '',
      ...(result.unanswered
        ? [
            "**v3's unanswered requests**",
            '',
            ...result.unanswered.map((request) => `- ${request}`),
            '',
          ]
        : []),
      ...requestBlock(result),
      ...(result.note ? [`**Reviewed:** ${result.note}`, ''] : []),
    ]
  }

  const requestBlock = ({ requests }: CaseResult): string[] => {
    if (requests === undefined) return []
    const list = (sent: string[]) => (sent.length > 0 ? ['```text', ...sent, '```'] : ['None.'])
    return requests.same
      ? ['**Requests:** the same from both engines', '', ...list(requests.v2), '']
      : [
          '**Requests differ**',
          '',
          'v2:',
          '',
          ...list(requests.v2),
          '',
          'v3:',
          '',
          ...list(requests.v3),
          '',
        ]
  }

  const markdown = [
    '# The differential: cases that differ',
    '',
    `fig-tree-evaluator ${version} against v3: ${results.length} cases, ${count('✓')} ✓ · ${count('⚠')} ⚠ · ${count('✗')} ✗.`,
    '',
    'Written by `pnpm differential` on every full run, and not committed. The ✗ cases come first: ' +
      'their outcomes differ and nothing explains it. Then the ⚠ cases, explained by an issue or the review map.',
    '',
    ...differing.map(
      ({ status, entry }) => `- ${status} [#${entry.id}](#case-${entry.id}) ${entry.from}`
    ),
    '',
    ...differing.flatMap(section),
  ].join('\n')
  return { markdown, files }
}
