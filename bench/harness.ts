/**
 * The v2-vs-v3 benchmark harness (implementation plan, Phase 16a.1).
 *
 * Timing methodology is lifted from src/dev/parseCacheBench.ts rather than
 * re-decided: every measurement is the min of five rounds after a warm-up,
 * because the min is the least noise-contaminated estimator — noise only
 * ever adds. Each result is folded into a sink so nothing is optimized
 * away.
 *
 * What this file adds over that one is arms, and the discipline around
 * them. A case declares the same logic several ways — at minimum a v2
 * spelling and a v3 spelling, sometimes a third for a v3 run under
 * different cache conditions — and the harness refuses to time any of
 * them until they have all produced the same value: a case whose arms
 * disagree is not a measurement, it is two different programs.
 *
 * Evaluation is async on both sides, so the loop awaits — promise
 * overhead is real but symmetric, and it is charged to every arm equally.
 *
 * The benches run under Node and, bundled, in a browser
 * (codegen/benchBrowser.mjs), so this file uses only what both have. The
 * clock is `performance.now()`: sub-microsecond on both, where
 * `process.hrtime` is Node's alone.
 */
import { deepEqual } from '../src'

const inNode = typeof process !== 'undefined' && process.versions?.node !== undefined

// Node's default ceiling is ten listeners per EventTarget, and v3 chains an
// abort listener per node onto its evaluation's root signal — so any
// expression wider than about ten concurrent nodes trips
// MaxListenersExceededWarning, tens of times per sweep. Raised here because
// the warning would bury the table, NOT because it is uninteresting: it is
// a v3 finding this bench surfaced, and it reaches consumers too. Browsers
// have no such ceiling, and no `node:events` to import.
if (inNode) {
  const events = await import('node:events')
  events.default.setMaxListeners(0)
}

/**
 * Where a line goes: the console always, and in a browser also a `<pre>`,
 * so the page shows its own results and a driver can wait for them.
 */
const out = (line: string) => {
  console.log(line)
  if (typeof document !== 'undefined') {
    const pre = document.getElementById('out')
    if (pre) pre.textContent += line + '\n'
  }
}

let sink = 0

/** Nanoseconds per iteration for one pass of `iterations` calls. */
const round = async (iterations: number, run: (i: number) => Promise<unknown>): Promise<number> => {
  const start = performance.now()
  for (let i = 0; i < iterations; i++) sink += (await run(i)) === undefined ? 0 : 1
  return ((performance.now() - start) * 1e6) / iterations
}

const time = async (iterations: number, run: (i: number) => Promise<unknown>): Promise<number> => {
  await round(Math.min(iterations, 50), run)
  let best = Infinity
  for (let r = 0; r < 5; r++) best = Math.min(best, await round(iterations, run))
  return best
}

export type Arms = Record<string, (i: number) => Promise<unknown>>

export interface Sweep {
  title: string
  /** What the sweep is testing, printed under the title. */
  note: string
  /** Arm names, in column order. Every case must supply exactly these. */
  arms: string[]
  /** Extra columns, each printed as `numerator / denominator`. */
  ratios?: [string, string][]
}

export interface Case {
  /** Row label — the axis value this row varies. */
  label: string
  iterations: number
  arms: Arms
}

/**
 * Every arm at iteration 0, compared against the first before anything is
 * timed. The check is v3's own `deepEqual`, the structural notion the
 * engine itself uses; a mismatch aborts the run rather than printing a
 * number nobody should trust.
 */
const assertAgreement = async (sweep: Sweep, kase: Case) => {
  const [first, ...rest] = sweep.arms
  const expected = await kase.arms[first](0)
  for (const arm of rest) {
    const actual = await kase.arms[arm](0)
    if (deepEqual(expected, actual)) continue
    console.error(`\nArms "${first}" and "${arm}" disagree on "${kase.label}" — not a measurement.`)
    // A case that evaluates many units returns them as an array; point at
    // the first one that differs rather than truncating the whole thing.
    if (Array.isArray(expected) && Array.isArray(actual)) {
      const at = expected.findIndex((value, i) => !deepEqual(value, actual[i]))
      console.error(
        `  first difference at index ${at}${expected.length !== actual.length ? ' (lengths differ)' : ''}`
      )
      console.error(`  ${first}:`, JSON.stringify(expected[at])?.slice(0, 300))
      console.error(`  ${arm}:`, JSON.stringify(actual[at])?.slice(0, 300))
    } else {
      console.error(`  ${first}:`, JSON.stringify(expected)?.slice(0, 300))
      console.error(`  ${arm}:`, JSON.stringify(actual)?.slice(0, 300))
    }
    // Unhandled, this ends a Node run non-zero and a browser run visibly
    throw new Error(`arms disagree on "${kase.label}"`)
  }
}

const us = (ns: number) => (ns / 1000).toFixed(ns < 10_000 ? 2 : 1)
const ratioName = ([top, bottom]: [string, string]) => `${top} / ${bottom}`

/**
 * Output is Markdown — a `###` heading, a note, and one table per sweep —
 * padded so it also reads as a table in a terminal. A run's output pastes
 * into an issue or the plan as-is, which is where results end up, and the
 * browser page renders it.
 *
 * Column widths come from the rows themselves, so a sweep's table is held
 * back and printed whole once its last row is in. That costs the row-by-
 * row reveal; in Node a tick goes to stderr per row instead, so a long
 * sweep still looks alive without dirtying the Markdown on stdout.
 */
let pending: { sweep: Sweep; rows: string[][] } | undefined

const heads = (sweep: Sweep) => [
  'label',
  ...sweep.arms.map((arm) => `${arm} µs`),
  ...(sweep.ratios ?? []).map(ratioName),
]

const flush = () => {
  if (pending === undefined) return
  const { sweep, rows } = pending
  pending = undefined
  const head = heads(sweep)
  const widths = head.map((h, i) => Math.max(h.length, 3, ...rows.map((row) => row[i].length)))
  // The first column is text and pads right; every other is a number and
  // pads left, with a `:` in the rule so it right-aligns when rendered too
  const line = (cells: string[]) =>
    `| ${cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join(' | ')} |`
  out(line(head))
  out(
    `| ${widths.map((w, i) => (i === 0 ? '-'.repeat(w) : `${'-'.repeat(w - 1)}:`)).join(' | ')} |`
  )
  for (const row of rows) out(line(row))
}

export const section = (sweep: Sweep) => {
  flush()
  out(`\n### ${sweep.title}\n`)
  out(`${sweep.note}\n`)
  pending = { sweep, rows: [] }
}

export const runCase = async (sweep: Sweep, kase: Case) => {
  await assertAgreement(sweep, kase)
  const timings: Record<string, number> = {}
  for (const arm of sweep.arms) timings[arm] = await time(kase.iterations, kase.arms[arm])
  const cells = [
    kase.label,
    ...sweep.arms.map((arm) => us(timings[arm])),
    ...(sweep.ratios ?? []).map(([top, bottom]) =>
      timings[bottom] === 0 ? '—' : `${(timings[top] / timings[bottom]).toFixed(1)}×`
    ),
  ]
  if (pending?.sweep === sweep) pending.rows.push(cells)
  else out(`| ${cells.join(' | ')} |`)
  if (inNode) process.stderr.write(`  · ${kase.label}\n`)
  return timings
}

export const note = (text: string) => {
  flush()
  out(`\n${text}`)
}

export const finish = () => {
  flush()
  out(`\n(sink ${sink})\n`)
}
