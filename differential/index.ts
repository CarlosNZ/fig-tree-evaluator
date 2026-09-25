/**
 * The differential ("The differential runner" in
 * docs-dev/v3-specs/v3-converter.md): every case of the corpus, evaluated
 * by v2, converted and evaluated by v3, and the two outcomes compared.
 *
 *   pnpm differential               each ✗ in full, each ⚠ as a line, a summary
 *   pnpm differential 42 57         those cases in full, untruncated
 *   pnpm differential --all         a line for every case, ✓ included
 *   pnpm differential --accept      write differential/baseline.json
 *   pnpm differential --check       fail on a case that moved from it
 *   pnpm differential --record-sql  record Postgres from a live Northwind
 *
 * A full run also writes differential/out/differences.md: every case that
 * differs, with the v2 expression, its conversion, the issues and both
 * outcomes, for debugging. It is rewritten each run, and not committed.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import type * as V2 from 'fig-tree-evaluator-v2'
import { Client } from 'pg'
import { format, resolveConfig } from 'prettier'
import { FetchClient, PostgresConnection, type PgClientLike } from '../src'
import pgConfig from '../test/database/pgConfig.json'
import { checkBaseline, renderBaseline } from './baseline'
import type { V2Io } from './case'
import { corpus } from './corpus'
import { mockFetch } from './mocks/fetch'
import { PostgresStandIn, type SqlRecording } from './mocks/postgres'
import { onUnanswered } from './mocks/unanswered'
import { recordingClient, renderRecordings } from './recordSql'
import { caseLines, detail, renderDifferences, summary } from './report'
import { reviewed } from './reviewed'
import { createRunner, type CaseResult } from './run'
import { unmappedOptions } from './v3Options'

const BASELINE = 'differential/baseline.json'
const OUT = 'differential/out'
const RECORDINGS = 'differential/sqlRecordings.ts'
const FLAGS = ['--all', '--accept', '--check', '--record-sql']

// Under tsx the package's ESM build loads as CommonJS, so its CommonJS
// build is required directly ("The v2 package" in the spec)
const v2 = createRequire(resolve('package.json'))('fig-tree-evaluator-v2') as typeof V2

/** The runner's own output: the engines' logging is silenced while it runs */
const out = (lines: string[]) => process.stdout.write(lines.map((line) => `${line}\n`).join(''))

const main = async () => {
  const args = process.argv.slice(2)
  const flags = new Set(args.filter((arg) => arg.startsWith('--')))
  const ids = args.filter((arg) => /^\d+$/.test(arg)).map(Number)
  const unknown = args.filter((arg) => !FLAGS.includes(arg) && !/^\d+$/.test(arg))
  if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(' ')}`)
  if (ids.length > 0 && (flags.has('--accept') || flags.has('--check')))
    throw new Error('--accept and --check run every case, so take no case ids')

  // Startup: every id unique, and every option one the runner can map
  const seen = new Set<number>()
  for (const entry of corpus) {
    if (seen.has(entry.id)) throw new Error(`The corpus has two cases numbered ${entry.id}`)
    seen.add(entry.id)
    const unmapped = unmappedOptions(entry)
    if (unmapped.length > 0)
      throw new Error(`#${entry.id} has options the runner cannot map: ${unmapped.join(', ')}`)
  }
  const missing = ids.filter((id) => !seen.has(id))
  if (missing.length > 0) throw new Error(`No case numbered ${missing.join(', ')}`)

  const version = new v2.FigTreeEvaluator().getVersion()
  const recording = flags.has('--record-sql')
  const live = recording ? new Client(pgConfig) : undefined
  const saved = new Map<string, SqlRecording>()
  let pg: PgClientLike
  if (live) {
    await live.connect()
    pg = recordingClient(live, saved)
  } else {
    if (!existsSync(RECORDINGS))
      throw new Error(
        `No ${RECORDINGS} yet: run \`pnpm differential --record-sql\` against a live Northwind`
      )
    const { sqlRecordings } = (await import('./sqlRecordings')) as { sqlRecordings: SqlRecording[] }
    pg = new PostgresStandIn(sqlRecordings)
  }
  const io = {
    v2: {
      http: v2.FetchClient(mockFetch as unknown as Parameters<typeof v2.FetchClient>[0]),
      postgres: v2.SQLNodePostgres(pg as Parameters<typeof v2.SQLNodePostgres>[0]),
    } satisfies V2Io,
    v3: {
      http: new FetchClient(mockFetch),
      postgres: new PostgresConnection(pg),
    },
  }
  const unanswered: string[] = []
  onUnanswered((message) => unanswered.push(message))
  const runner = createRunner(v2, io, reviewed, unanswered)
  console.log = () => undefined
  console.warn = () => undefined

  const results: CaseResult[] = []
  try {
    for (const entry of ids.length > 0 ? corpus.filter((c) => ids.includes(c.id)) : corpus) {
      results.push(await runner.run(entry))
    }
  } finally {
    onUnanswered(undefined)
    await live?.end()
  }

  if (ids.length > 0) {
    out(results.flatMap(detail))
    return
  }
  out(results.flatMap((result) => caseLines(result, flags.has('--all'))))
  out(summary(results, runner.notes))

  const { markdown, files } = renderDifferences(results, version)
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT)
  writeFileSync(join(OUT, 'differences.md'), `${markdown}\n`)
  for (const [name, text] of Object.entries(files)) writeFileSync(join(OUT, name), text)
  out(['', `Every case that differs, in full: ${OUT}/differences.md`])

  if (recording) {
    const source = await format(renderRecordings(saved.values()), {
      ...(await resolveConfig(RECORDINGS)),
      filepath: RECORDINGS,
    })
    writeFileSync(RECORDINGS, source)
    out(['', `Recorded ${saved.size} Postgres queries to ${RECORDINGS}`])
  }
  if (flags.has('--accept')) {
    writeFileSync(BASELINE, renderBaseline(results, version))
    out(['', `Accepted: ${BASELINE}`])
  }
  if (flags.has('--check')) {
    if (!existsSync(BASELINE))
      throw new Error(`No ${BASELINE} yet: \`pnpm differential --accept\` writes it`)
    const moved = checkBaseline(readFileSync(BASELINE, 'utf8'), results, version)
    out(['', moved.length > 0 ? `Moved from the baseline:` : `No case moved from the baseline`])
    out(moved.map((line) => `  ${line}`))
    if (moved.length > 0) process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Runner error: ${(error as Error)?.message ?? error}\n`)
  process.exitCode = 2
})
