/**
 * Real-world I — Conforma template elements (implementation plan, Phase
 * 16a.2; Carl's corpus, September 2026).
 *
 * The 62 form elements of a real Conforma template, as exported: each has
 * five properties, of which `parameters` is an object of its own. These
 * are the front-end expressions — re-evaluated over and over as the
 * applicant fills the form — and in the app today every property is
 * evaluated on its own, and every key of `parameters` on its own. The
 * template arrives freshly parsed from JSON, so realistically only the
 * content layer can ever serve it; the identity arm is here as the
 * ceiling, not the expectation.
 *
 * One pass = one full re-evaluation of the whole template at the given
 * granularity, every unit concurrently, so a row's figure is "what one
 * form re-render costs the engine". The three granularities are the
 * matrix Carl asked for: every leaf on its own (the app today);
 * properties on their own but `parameters` as one expression; and each
 * element as a single expression.
 *
 * Both engines run from bench/real-world/fixtures.ts — same data, same
 * instant I/O stand-ins, same host functions — and the v3 spelling is
 * migrated from the v2 export by bench/real-world/migrate.ts. The harness
 * checks that every unit agrees across all four arms before timing.
 */
import type { EvaluatorNode } from '../v2-src/types'
import { finish, note, runCase, section, type Sweep } from './harness'
import {
  elementData,
  elementUnits,
  elementsV2,
  elementsV3,
  fresh,
  newV2,
  newV3,
  type Granularity,
  type Unit,
} from './real-world/fixtures'

/**
 * The search box changes as the applicant types; the rest of the form
 * holds.
 */
const SEARCHES = ['amox', 'amoxi', 'amoxic', 'para', 'parac']
const data = (i: number) => elementData(SEARCHES[i % SEARCHES.length])

const v2 = newV2()
const v3 = newV3()

const all = (units: Unit[], run: (unit: Unit) => Promise<unknown>) => Promise.all(units.map(run))

const row = (label: string, granularity: Granularity, iterations: number) => {
  const unitsV2 = elementUnits(elementsV2, granularity)
  const unitsV3 = elementUnits(elementsV3, granularity)
  return {
    label: `${label} (${unitsV3.length} units)`,
    iterations,
    arms: {
      v2: (i: number) => {
        const d = data(i)
        return all(unitsV2, (u) => v2.evaluate(u.expr as EvaluatorNode, { data: d }))
      },
      'v3 identity': (i: number) => {
        const d = data(i)
        return all(unitsV3, (u) => v3.evaluate(u.expr, { data: d }))
      },
      'v3 content': (i: number) => {
        const d = data(i)
        return all(unitsV3, (u) => v3.evaluate(fresh(u.expr), { data: d }))
      },
      // One instance per pass: the first render after the app loads, every
      // unit compiling once. Conforma holds a single global instance, so a
      // fresh one per unit would be measuring a deployment nobody runs.
      'v3 cold': (i: number) => {
        const d = data(i)
        const cold = newV3()
        return all(unitsV3, (u) => cold.evaluate(u.expr, { data: d }))
      },
    },
  }
}

const sweep: Sweep = {
  title: 'Conforma template elements — one full form re-evaluation per pass',
  note: 'Front-end expressions, evaluated per interaction. Content is the realistic v3 arm.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [
    ['v2', 'v3 content'],
    ['v2', 'v3 cold'],
  ],
}

const main = async () => {
  section(sweep)
  await runCase(sweep, row('every property and parameter', 'every-leaf', 40))
  await runCase(sweep, row('properties; parameters whole', 'params-whole', 40))
  await runCase(sweep, row('each element whole', 'item-whole', 60))
  note(`'v3 cold' builds one instance per pass — a first render — and compiles every unit once.`)
  finish()
}

main()
