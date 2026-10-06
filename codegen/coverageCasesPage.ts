/**
 * Builds docs-dev/v3-specs/v3-coverage-cases.md, a readable page of the
 * #217 case corpus (test/coverage-cases.ts): each case's expression, then
 * what `fallbackCoverage` should report for it, one line per finding. The
 * corpus is the source, so the page is regenerated rather than edited:
 * `pnpm coverageCases`.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as prettier from 'prettier'
import { coreOperators } from '../src/operators/index'
import { fragments, sections } from '../test/coverage-cases'
import type { CoverageCase, Finding, NodePath } from '../test/coverage-cases'

const here = dirname(fileURLToPath(import.meta.url))
const OUTPUT = resolve(here, '../docs-dev/v3-specs/v3-coverage-cases.md')

// ── Printing values as the corpus writes them ───────────────────────

const IDENTIFIER = /^[$A-Za-z_][$\w]*$/

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const key = (name: string) => (IDENTIFIER.test(name) ? name : quote(name))

/** A long witness string, such as 1100 x's, shown by its length. */
const scalar = (value: unknown, abbreviate: boolean): string => {
  if (typeof value === 'string')
    return abbreviate && value.length > 24
      ? `${quote(value.slice(0, 4) + '…')} (${value.length} characters)`
      : quote(value)
  return String(value)
}

const oneLine = (value: unknown, abbreviate = false): string => {
  if (Array.isArray(value)) return `[${value.map((v) => oneLine(v, abbreviate)).join(', ')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'
    return `{ ${entries.map(([k, v]) => `${key(k)}: ${oneLine(v, abbreviate)}`).join(', ')} }`
  }
  return scalar(value, abbreviate)
}

// ── Naming the node a finding is on ─────────────────────────────────

const OPERATORS = new Set([
  ...coreOperators.flatMap((op) => [op.name, ...(op.alias !== undefined ? [op.alias] : [])]),
  'http',
  'graphQL',
  'sql',
  'twice',
  'shaky',
  'picky',
])

const at = (expression: unknown, path: NodePath): unknown =>
  path.reduce<unknown>(
    (node, step) =>
      node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[step] : node,
    expression
  )

/** A path as an author reads it: `$divide[1]`, `$map.each`, `vars.n`. */
const showPath = (path: NodePath) =>
  path
    .map((step, i) => (typeof step === 'number' ? `[${step}]` : i === 0 ? step : `.${step}`))
    .join('')

const where = (path: NodePath) => (path.length === 0 ? 'the root' : `\`${showPath(path)}\``)

/** What sits at a path: an operator, a call, an argument or a reference. */
const nodeAt = (expression: unknown, path: NodePath, parameter?: string): string => {
  const parent = path.length > 0 ? at(expression, path.slice(0, -1)) : undefined
  const last = path[path.length - 1]
  if (
    parent !== null &&
    typeof parent === 'object' &&
    'fragment' in parent &&
    last === 'parameters'
  )
    return `the arguments of fragment **${String((parent as { fragment: unknown }).fragment)}**`
  const parentName =
    typeof path[path.length - 2] === 'string' ? (path[path.length - 2] as string) : ''
  if (parentName.startsWith('$') && !OPERATORS.has(parentName.slice(1)) && last === parameter)
    return `argument \`${parameter}\` of fragment **${parentName.slice(1)}** at ${where(path)}`

  const node = at(expression, path)
  const located = `at ${where(path)}`
  if (typeof node === 'string') return `\`${node}\` ${located}`
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    if ('operator' in node) return `**${String(node.operator)}** ${located}`
    if ('fragment' in node) return `the call to fragment **${String(node.fragment)}** ${located}`
    const named = Object.keys(node).find((k) => k.startsWith('$'))
    if (named !== undefined) {
      const name = named.slice(1)
      return OPERATORS.has(name)
        ? `**${name}** ${located}`
        : `the call to fragment **${name}** ${located}`
    }
  }
  return `plain data ${located}`
}

// ── Saying what a case expects ──────────────────────────────────────

const INSTANCES: Record<NonNullable<CoverageCase['instance']>, string> = {
  strict: 'with `strictDataPaths: true`',
  fragments: 'with the fragments listed at the top',
  lowerDefault: "with `operatorDefaults: { lower: { fallback: '' } }`",
  io: 'with HTTP and SQL clients, and no `http.baseEndpoint`',
  ioBase: "with HTTP and SQL clients, and `http.baseEndpoint: 'https://api.test'`",
  host: 'with the host operators listed at the top',
}

const exampleOf = (finding: Finding) => {
  const client =
    finding.client === 'fails'
      ? ' with the client failing'
      : finding.client === 'slow'
        ? ' with a slow client'
        : ''
  if (finding.witness === undefined) return ''
  const data =
    Object.keys(finding.witness).length === 0 ? '' : ` data \`${oneLine(finding.witness, true)}\``
  return data === '' && client === '' ? '' : `. E.g.${data}${client}`
}

const findingLine = (item: CoverageCase, finding: Finding, covered: boolean): string => {
  const subject =
    finding.fragment !== undefined
      ? `${showFragmentPlace(finding.fragment, finding.fragmentPath)}, called at ${where(finding.at)}`
      : nodeAt(item.expression, finding.at, finding.parameter)
  const certainty = finding.will ? 'always fails' : 'may fail'
  const on = finding.parameter !== undefined ? ` on \`${finding.parameter}\`` : ''
  const caught = covered ? `, ${caughtBy(item, finding)}` : ''
  const unwitnessed =
    finding.witness === undefined && finding.will === undefined ? ' (no data makes it happen)' : ''
  // An external operator's finding stands for any code its own code throws
  const code = finding.external
    ? `\`${finding.code}\` (external: whatever code it throws)`
    : `\`${finding.code}\``
  return `- ${covered ? '✓' : '✗'} ${subject} — ${certainty}: ${code}${on}${caught}${exampleOf(finding)}${unwitnessed}`
}

const showFragmentPlace = (fragment: string, path: NodePath | undefined) =>
  path === undefined || (path.length === 1 && path[0] === 'expression')
    ? `the body of fragment **${fragment}**`
    : `\`${showPath(path.slice(1))}\` in the body of fragment **${fragment}**`

const caughtBy = (item: CoverageCase, finding: Finding) => {
  if (finding.byFragmentPath !== undefined)
    return `caught by the fallback on the body of fragment **${calledAt(item, finding.by ?? [])}**`
  if (finding.fragment === undefined && JSON.stringify(finding.by) === JSON.stringify(finding.at))
    return 'caught by its own fallback'
  const by = finding.by ?? []
  const node = nodeAt(item.expression, by)
  return `caught by the fallback on ${node}`
}

/** The fragment a call at this path names. */
const calledAt = (item: CoverageCase, path: NodePath): string => {
  const call = at(item.expression, path)
  if (call === null || typeof call !== 'object') return '?'
  if ('fragment' in call) return String(call.fragment)
  return (Object.keys(call).find((k) => k.startsWith('$')) ?? '?').slice(1)
}

const caseBlock = (item: CoverageCase): string => {
  const context = [
    item.instance !== undefined ? INSTANCES[item.instance] : undefined,
    item.timeout !== undefined ? `under a ${item.timeout} ms timeout on the instance` : undefined,
    item.options !== undefined ? `analysis options \`${oneLine(item.options)}\`` : undefined,
  ].filter((part) => part !== undefined)
  const findings = [
    ...(item.uncovered ?? []).map((finding) => findingLine(item, finding, false)),
    ...(item.covered ?? []).map((finding) => findingLine(item, finding, true)),
  ]
  return [
    `**${item.name}**${context.length > 0 ? ` (${context.join('; ')})` : ''}`,
    // Prettier breaks a long one, keeping the corpus's quotes and keys
    '```json5\n' + oneLine(item.expression) + '\n```',
    findings.length > 0 ? findings.join('\n') : '- Nothing can throw.',
    ...(item.note !== undefined ? [`> ${item.note}.`] : []),
    ...(item.open !== undefined ? [`> **Open:** ${item.open}.`] : []),
  ].join('\n\n')
}

// ── The page ────────────────────────────────────────────────────────

const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')

const fragmentList = Object.entries(fragments)
  .map(([name, definition]) => `- **${name}**: \`${oneLine(definition)}\``)
  .join('\n')

const LEGEND = [
  'A finding names the node where the failure starts, the error code it would carry,',
  'and the parameter involved. **May fail** means some data makes it happen; the',
  'example is data under which the engine really does fail that way. **Always fails**',
  'means it fails whenever the node is reached. A finding no data can trigger is a',
  'false positive the design accepts, and its case says why.',
].join(' ')

const HOST_OPERATORS = [
  '`twice` doubles a number, and `shaky` fails on an empty string, both declaring nothing;',
  '`picky` fails on one and says so in its `analysis`; `nap` hands its number back after a',
  '30 ms timer, and declares that it fails on nothing.',
].join(' ')

const count = Object.values(sections).reduce((sum, cases) => sum + cases.length, 0)

const page = `# FigTree v3 — Fallback coverage cases

_Generated from test/coverage-cases.ts by \`pnpm coverageCases\`: edit the cases there, not this page. ${count} cases for the precise \`fallbackCoverage\` of [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217), checked against the engine by test/coverage-cases.test.ts. The decisions behind them are in [v3-coverage-decisions.md](v3-coverage-decisions.md)._

Each case is an expression and what the analysis should report for it:

- ✗ a failure nothing catches, so it can reject \`evaluate()\`
- ✓ a failure a fallback catches

${LEGEND}

Where a case uses an instance other than \`new FigTree()\`:

- **Fragments:**
${fragmentList
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
- **Host operators:** ${HOST_OPERATORS}
- **Clients:** a working HTTP client answers \`{ n: 1, s: 'x' }\`, and a working SQL connection answers \`[{ a: 1, b: 2 }]\`.

## Contents

${Object.keys(sections)
  .map((section) => `- [${section}](#${anchor(section)})`)
  .join('\n')}

${Object.entries(sections)
  .map(([section, cases]) => `## ${section}\n\n${cases.map(caseBlock).join('\n\n')}`)
  .join('\n\n')}
`

const options = await prettier.resolveConfig(OUTPUT)
writeFileSync(OUTPUT, await prettier.format(page, { ...options, parser: 'markdown' }), 'utf8')
console.log(`Wrote ${count} cases to ${OUTPUT}`)
