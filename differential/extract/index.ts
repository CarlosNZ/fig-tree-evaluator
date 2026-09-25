/**
 * Extracts differential/corpus.ts from the tests of the v2 release the
 * package follows, and checks it ("The corpus" in
 * docs-dev/v3-specs/v3-converter.md). Run once, from the repo root, with a
 * live Northwind Postgres (test/database/pgConfig.json):
 *
 *   pnpm exec tsx differential/extract/index.ts
 *
 * 1. The release's tests, from its git tag, run unchanged under Jest
 *    (jest.config.mjs), recording every evaluation. After each file,
 *    setup.ts runs each one again as the runner will, and writes it out.
 * 2. The cases are assembled in test order. One identical to an earlier
 *    case is a repeat, and one whose outcome depended on an option v3 has
 *    no counterpart for is left out, as is one whose SQL ran on SQLite.
 * 3. The corpus is written, then each case is run through v2 again from
 *    the written file, which must give the outcome extraction recorded.
 */
import { execSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse as parseEnv } from 'dotenv'
import type * as V2 from 'fig-tree-evaluator-v2'
import { format, resolveConfig } from 'prettier'
import type { Case } from '../case'
import { onUnanswered } from '../mocks/unanswered'
import { openV2Io } from './io'
import { runV2, sameOutcome, type Outcome } from '../outcome'
import { renderCorpus, type WrittenCase } from './renderCorpus'

/** One evaluation, as setup.ts writes it, or one on SQLite, as that alone */
type Extracted = Kept | { test: string; onSqlite: true }

interface Kept {
  test: string
  expression: string
  options?: string
  /** Its outcome as the runner will run it */
  outcome: Outcome
  /** What its test saw, where that differs */
  seen?: Outcome
  leftOut?: string
  /** The options v3 has no counterpart for that it was kept without */
  removed?: string[]
}

const CORPUS = 'differential/corpus.ts'

// Under tsx the package's ESM build loads as CommonJS, so its CommonJS
// build is required directly ("The v2 package" in the spec)
const v2 = createRequire(resolve('package.json'))('fig-tree-evaluator-v2') as typeof V2

const main = async () => {
  const version = new v2.FigTreeEvaluator().getVersion()
  const work = mkdtempSync(join(tmpdir(), 'fig-tree-corpus-'))
  const [tag, out] = [join(work, 'tag'), join(work, 'out')]
  mkdirSync(tag)
  mkdirSync(out)
  execSync(`git archive v${version} test codegen/queryBuilder.ts | tar -x -C ${tag}`)

  // The tests load a .env, whose secrets must never reach them, and so
  // never the corpus
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    EXTRACT_DIR: tag,
    EXTRACT_OUT: out,
    DOTENV_CONFIG_PATH: join(work, 'none.env'),
  }
  delete env.GITHUB_TOKEN
  const jest = spawnSync(
    'pnpm',
    ['exec', 'jest', '--config', 'differential/extract/jest.config.mjs'],
    {
      env,
      stdio: 'inherit',
    }
  )
  if (jest.status !== 0) throw new Error(`The v${version} tests did not all pass under extraction`)

  const kept: (WrittenCase & { outcome: Outcome })[] = []
  const keys = new Set<string>()
  const [repeats, leftOut, differs, removed, sqlite]: string[][] = [[], [], [], [], []]
  let evaluations = 0
  const files = readdirSync(out).sort((a, b) => parseInt(a) - parseInt(b))
  for (const file of files) {
    const url = pathToFileURL(join(out, file)).href
    const { default: extracted } = (await import(url)) as { default: Extracted[] }
    evaluations += extracted.length
    for (const entry of extracted) {
      const from = `${file.replace(/\.ts$/, '')} › ${entry.test}`
      if ('onSqlite' in entry) {
        sqlite.push(from)
        continue
      }
      const { expression, options, outcome, seen, leftOut: why } = entry
      if (why !== undefined) {
        leftOut.push(`${from}: ${why}`)
        continue
      }
      const key = JSON.stringify([expression, options])
      if (keys.has(key)) {
        repeats.push(from)
        continue
      }
      keys.add(key)
      if (seen !== undefined) differs.push(from)
      if (entry.removed !== undefined) removed.push(`${from}: ${entry.removed.join(', ')}`)
      kept.push({ from, expression, options, outcome })
    }
  }

  const source = await format(renderCorpus(kept, version), {
    ...(await resolveConfig(CORPUS)),
    filepath: CORPUS,
  })
  refuseSecrets(source)
  writeFileSync(CORPUS, source)

  const { corpus } = (await import(pathToFileURL(resolve(CORPUS)).href)) as { corpus: Case[] }
  const unanswered: string[] = []
  const failed: string[] = []
  onUnanswered((message) => unanswered.push(message))
  const { io, close } = await openV2Io(v2)
  // v2's FetchClient logs every failed response
  const log = console.log
  console.log = () => undefined
  try {
    for (const [index, entry] of corpus.entries())
      if (!sameOutcome(await runV2(v2, entry, io), kept[index].outcome))
        failed.push(`#${entry.id} ${entry.from}`)
  } finally {
    console.log = log
    onUnanswered(undefined)
    await close()
  }
  rmSync(work, { recursive: true })

  const list = (items: string[]) => items.map((item) => `    ${item}`).join('\n')
  console.log(`
fig-tree-evaluator ${version}: ${evaluations} evaluations in ${files.length} test files
(00_utils, 0_typeCheck, 25_metaData and 27_isFigTreeExpression evaluate
nothing, and 24_cache's values are random or come from the cache)

  ${corpus.length} cases written to ${CORPUS}
  ${repeats.length} repeats of an earlier case
  ${sqlite.length} on SQLite, which the Postgres tests beside them repeat
  ${removed.length} kept without an option v3 has no counterpart for, their outcome the same:
${list(removed)}
  ${leftOut.length} left out, their outcome depending on it:
${list(leftOut)}
  ${differs.length} whose outcome under the runner's defaults is not what their test saw,
  which dropped returnErrorAsString or used another client:
${list(differs)}
`)
  if (unanswered.length > 0) console.log(`Unanswered requests:\n${list(unanswered)}`)
  if (failed.length > 0)
    console.log(`Run from the written corpus, these gave another outcome:\n${list(failed)}`)
  else
    console.log(
      `Check: every case, run from the written corpus, gives the outcome extraction recorded`
    )
  if (unanswered.length > 0 || failed.length > 0) process.exitCode = 1
}

/** No value from a local .env reaches the corpus */
const refuseSecrets = (source: string) => {
  if (!existsSync('.env')) return
  for (const [key, value] of Object.entries(parseEnv(readFileSync('.env'))))
    if (value.length >= 8 && source.includes(value))
      throw new Error(`The corpus would hold the value of ${key} from .env, so it was not written`)
}

main()
