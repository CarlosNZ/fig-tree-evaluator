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
 */
import { setMaxListeners } from 'node:events'
import { deepEqual } from '../src'

// Node's default ceiling is ten listeners per EventTarget, and v3 chains an
// abort listener per node onto its evaluation's root signal — so any
// expression wider than about ten concurrent nodes trips
// MaxListenersExceededWarning, tens of times per sweep. Raised here because
// the warning would bury the table, NOT because it is uninteresting: it is
// a v3 finding this bench surfaced, and it reaches consumers too.
setMaxListeners(0)

let sink = 0

/** Nanoseconds per iteration for one pass of `iterations` calls. */
const round = async (iterations: number, run: (i: number) => Promise<unknown>): Promise<number> => {
  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) sink += (await run(i)) === undefined ? 0 : 1
  return Number(process.hrtime.bigint() - start) / iterations
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
    console.error(`  ${first}:`, JSON.stringify(expected)?.slice(0, 300))
    console.error(`  ${arm}:`, JSON.stringify(actual)?.slice(0, 300))
    process.exit(1)
  }
}

const us = (ns: number) => (ns / 1000).toFixed(ns < 10_000 ? 2 : 1)
const ratioName = ([top, bottom]: [string, string]) => `${top} / ${bottom}`

/**
 * Column headings, and the widths every row pads to. Derived from the
 * sweep alone so the header and the rows cannot disagree — arm names are
 * free-form, and "v3 cold / v3 warm" is wider than any number under it.
 */
const layout = (sweep: Sweep) => {
  const heads = [...sweep.arms.map((arm) => `${arm} µs`), ...(sweep.ratios ?? []).map(ratioName)]
  return { heads, widths: heads.map((head) => Math.max(head.length, 8) + 2) }
}

const columns = (label: string, cells: string[], widths: number[]) =>
  console.log(label.padEnd(28) + cells.map((cell, i) => cell.padStart(widths[i])).join(''))

export const section = (sweep: Sweep) => {
  console.log(`\n── ${sweep.title} ${'─'.repeat(Math.max(0, 64 - sweep.title.length))}`)
  console.log(`${sweep.note}\n`)
  const { heads, widths } = layout(sweep)
  columns('label', heads, widths)
}

export const runCase = async (sweep: Sweep, kase: Case) => {
  await assertAgreement(sweep, kase)
  const timings: Record<string, number> = {}
  for (const arm of sweep.arms) timings[arm] = await time(kase.iterations, kase.arms[arm])
  const cells = [
    ...sweep.arms.map((arm) => us(timings[arm])),
    ...(sweep.ratios ?? []).map(([top, bottom]) =>
      timings[bottom] === 0 ? '—' : `${(timings[top] / timings[bottom]).toFixed(1)}×`
    ),
  ]
  columns(kase.label, cells, layout(sweep).widths)
  return timings
}

export const note = (text: string) => console.log(`\n${text}`)

export const finish = () => console.log(`\n(sink ${sink})\n`)
