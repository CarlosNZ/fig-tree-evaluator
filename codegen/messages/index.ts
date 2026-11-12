/**
 * Every message the library writes, with what the tests make of it.
 *
 *   pnpm messages           run the suite, write out/messages.md
 *   pnpm messages --check   the same, then fail on a message nothing produced
 *
 * The v3 suite runs under jest.config.mjs here, which wraps each message
 * in src/ (find.mjs) to record the text it produces. The page lists every
 * message by file, linked to its line: how it reads in the source, and up
 * to three texts the suite made of it. A message whose every text sits
 * inside a longer one is a part, and each of its texts shows the shortest
 * longer text that holds it, a message or an assembly. A message nothing
 * produced is listed first, unless unreached.ts accepts it with a reason.
 * The page is rewritten each run, and not committed.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { allMessages, ROOT } from './find.mjs'
import { unreached, type Unreached } from './unreached'

const HERE = join(ROOT, 'codegen', 'messages')
const OUT = join(HERE, 'out')
const RAW = join(OUT, 'raw')
const PAGE = join(OUT, 'messages.md')
const EXAMPLES = 3

interface Message {
  kind: 'message' | 'assembly'
  id: string
  file: string
  line: number
  template: string
}

interface Produced {
  text: string
  count: number
  test: string | null
  testPath: string | null
}

const out = (line = '') => process.stdout.write(`${line}\n`)

/** Run the suite under the recording config; whether every test passed */
const runSuite = (): boolean => {
  rmSync(OUT, { recursive: true, force: true })
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'jest',
      '--config',
      join(HERE, 'jest.config.mjs'),
      '--no-cache',
      '--silent',
      '--reporters=summary',
    ],
    { cwd: ROOT, stdio: 'inherit' }
  )
  return result.status === 0
}

/** What the suite produced, by message id, most often produced first */
const readProduced = (): Map<string, Produced[]> => {
  const byText = new Map<string, Map<string, Produced>>()
  if (!existsSync(RAW)) return new Map()
  for (const name of readdirSync(RAW)) {
    const record = JSON.parse(readFileSync(join(RAW, name), 'utf8')) as {
      testPath: string | null
      messages: { id: string; texts: Omit<Produced, 'testPath'>[] }[]
    }
    for (const { id, texts } of record.messages) {
      let known = byText.get(id)
      if (known === undefined) byText.set(id, (known = new Map()))
      for (const { text, count, test } of texts) {
        const entry = known.get(text)
        if (entry !== undefined) entry.count += count
        else known.set(text, { text, count, test, testPath: record.testPath })
      }
    }
  }
  return new Map(
    [...byText].map(([id, texts]) => [
      id,
      [...texts.values()].sort(
        (a, b) => b.count - a.count || a.text.length - b.text.length || a.text.localeCompare(b.text)
      ),
    ])
  )
}

// ── Markdown ──────────────────────────────────────────────────────────

const escape = (text: string) => text.replace(/[\\*_[\]<>|#`]/g, (char) => `\\${char}`)

/**
 * Text as prose: Markdown's own characters escaped and lines joined, but
 * code spans kept where the backticks pair up, as the messages use them
 */
const prose = (text: string): string => {
  const flat = text.replace(/\n/g, ' ⏎ ')
  if ((flat.match(/`/g)?.length ?? 0) % 2 !== 0) return escape(flat)
  return flat
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 === 1 ? part : escape(part)))
    .join('')
}

/** Text as a code span, whatever backticks it holds */
const code = (text: string): string => {
  const flat = text.replace(/\n/g, '\\n')
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  const pad = flat.startsWith('`') || flat.endsWith('`') || flat.startsWith(' ') ? ' ' : ''
  return `${fence}${pad}${flat}${pad}${fence}`
}

const link = ({ file, line }: Message): string =>
  `[${file.replace(/^src\//, '')}:${line}](../../../${file}#L${line})`

/** GitHub's heading anchor */
const slug = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-')

const hasHoles = (message: Message) => message.template.includes('${')

const testOf = (produced: Produced): string => {
  const test = produced.test === null ? '' : ` › ${produced.test}`
  const where = `${produced.testPath ?? 'unknown test file'}${test}`
  return where.length > 100 ? `${where.slice(0, 99)}…` : where
}

const clipped = (text: string, limit = 300) =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text

// ── Parts ─────────────────────────────────────────────────────────────

interface Holder {
  text: string
  by: Message
  produced: Produced
}

/**
 * Every text any message or assembly produced, for finding what holds a
 * part. A text is held by another only when that one is strictly longer.
 */
const holdersOf = (strings: Message[], produced: Map<string, Produced[]>) => {
  const all: Holder[] = []
  for (const by of strings)
    for (const each of produced.get(by.id) ?? []) all.push({ text: each.text, by, produced: each })
  // Shortest first, so the first match is the nearest whole
  all.sort((a, b) => a.text.length - b.text.length)
  /** The shortest longer text holding this one, from the same test if any */
  return (part: Produced, of: Message): Holder | undefined => {
    let any: Holder | undefined
    for (const holder of all) {
      if (holder.by.id === of.id || holder.text.length <= part.text.length) continue
      if (!holder.text.includes(part.text)) continue
      if (holder.produced.test === part.test && holder.produced.testPath === part.testPath)
        return holder
      any ??= holder
    }
    return any
  }
}

// ── The page ──────────────────────────────────────────────────────────

const entry = (
  message: Message,
  produced: Produced[] | undefined,
  holderOf: (part: Produced, of: Message) => Holder | undefined,
  accepted?: Unreached
) => {
  const times = produced?.reduce((sum, { count }) => sum + count, 0) ?? 0
  const holders = produced?.map((each) => holderOf(each, message))
  const isPart = holders !== undefined && holders.every((holder) => holder !== undefined)
  const status =
    produced === undefined
      ? accepted === undefined
        ? ' · **never produced**'
        : ` · never produced: ${prose(accepted.reason)}`
      : ` · produced ×${times}${isPart ? ' · only ever part of a longer message' : ''}`
  const lines = [
    `- ${link(message)}${status}`,
    `  - source: ${hasHoles(message) ? code(message.template) : prose(message.template)}`,
  ]
  // A literal produces only itself, so a whole one needs no examples
  const shown = hasHoles(message) || isPart ? (produced ?? []).slice(0, EXAMPLES) : []
  for (const [i, example] of shown.entries()) {
    lines.push(`  - produced: ${prose(example.text)} — _${prose(testOf(example))}_`)
    const holder = isPart ? holders![i] : undefined
    if (holder !== undefined)
      lines.push(`    - in full: ${prose(clipped(holder.text))} (${link(holder.by)})`)
  }
  if (shown.length > 0 && produced!.length > EXAMPLES)
    lines.push(`  - _and ${produced!.length - EXAMPLES} more_`)
  return lines
}

const matches = (accepted: Unreached, message: Message) =>
  accepted.file === message.file && accepted.message === message.template

const renderPage = (
  messages: Message[],
  assemblies: Message[],
  produced: Map<string, Produced[]>,
  passed: boolean
) => {
  const files = [...new Set(messages.map(({ file }) => file))]
  const missing = messages.filter(
    (message) =>
      !produced.has(message.id) && !unreached.some((accepted) => matches(accepted, message))
  )
  const holderOf = holdersOf([...messages, ...assemblies], produced)
  const failures = passed ? '' : ' (**which had failures**)'
  const lines = [
    '# Library messages',
    '',
    `_Generated by \`pnpm messages\` from a run of the v3 suite${failures}. ` +
      'Every message string in src/ outside src/catalog, by file and line. Rewritten each ' +
      'run, and not committed._',
    '',
    'Each entry is one string in the source:',
    '',
    '- **The heading line:** its file and line, how many times the suite produced it, and ' +
      'whether it is only ever part of a longer message.',
    '- **source:** how it reads in the source, each `${…}` hole showing the code that fills it.',
    `- **produced:** up to ${EXAMPLES} of the texts the suite made of it, each with the first ` +
      'test that made it.',
    '- **in full:** for a part, the nearest longer text that held it, and where that is put ' +
      'together.',
    '',
    `${messages.length} messages in ${files.length} files. ${messages.length - missing.length} produced or accepted as unreachable, ${missing.length} never produced.`,
    '',
  ]
  if (missing.length > 0) {
    lines.push('## Never produced', '')
    for (const message of missing) lines.push(`- ${link(message)} ${code(message.template)}`)
    lines.push('')
  }
  lines.push('## Files', '')
  for (const file of files) {
    const count = messages.filter((message) => message.file === file).length
    lines.push(`- [${file}](#${slug(file)}) (${count})`)
  }
  lines.push('')
  for (const file of files) {
    lines.push(`## ${file}`, '')
    for (const message of messages.filter((m) => m.file === file))
      lines.push(
        ...entry(
          message,
          produced.get(message.id),
          holderOf,
          unreached.find((accepted) => matches(accepted, message))
        )
      )
    lines.push('')
  }
  return { page: lines.join('\n'), missing }
}

// ── Main ──────────────────────────────────────────────────────────────

const main = () => {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== '--check')
  if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(' ')}`)
  const check = args.includes('--check')

  const passed = runSuite()
  const produced = readProduced()
  const strings = (allMessages() as Message[]).map((message) => ({
    ...message,
    template: message.template.replace(/\s*\n\s*/g, ' '),
  }))
  const messages = strings.filter(({ kind }) => kind === 'message')
  const assemblies = strings.filter(({ kind }) => kind === 'assembly')
  const ids = new Set(strings.map(({ id }) => id))
  const strays = [...produced.keys()].filter((id) => !ids.has(id))

  const { page, missing } = renderPage(messages, assemblies, produced, passed)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(PAGE, page)

  // An entry in unreached.ts with no message it matches left unproduced
  const stale = unreached.filter(
    (accepted) => !messages.some((m) => matches(accepted, m) && !produced.has(m.id))
  )

  out()
  out(`${messages.length} messages: ${missing.length} never produced`)
  for (const message of missing) out(`  ${message.file}:${message.line}  ${message.template}`)
  for (const accepted of stale)
    out(`  stale in unreached.ts: ${accepted.file}  ${accepted.message}`)
  for (const id of strays) out(`  recorded for an unknown message: ${id}`)
  out(`Wrote ${PAGE.slice(ROOT.length + 1)}`)

  if (check && (!passed || missing.length > 0 || stale.length > 0 || strays.length > 0))
    process.exitCode = 1
}

main()
