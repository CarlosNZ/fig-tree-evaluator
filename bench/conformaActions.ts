/**
 * Real-world II — Conforma template actions (implementation plan, Phase
 * 16a.2; Carl's corpus, September 2026).
 *
 * The 19 actions of the same template: each a `condition` and a
 * `parameter_queries` object. These run on the back end, once per event,
 * against expressions loaded from the database for that event — on a
 * single global instance, as Conforma runs it.
 *
 * That last fact decides the arms. The expressions are fresh objects per
 * event, so identity can never serve them; but the same template's actions
 * recur across events, so on a held v3 instance the content layer does —
 * which is why `v3 content` is the steady state here and not, as one
 * would assume from v2, nothing. `v3 cold` is the first event after
 * startup: one fresh instance per pass, every unit compiling once. v2 has
 * no parse cache, so a held v2 instance is its own steady state.
 *
 * The matrix is Carl's: every property and every parameter query on its
 * own (the app today); `condition` on its own with `parameter_queries` as
 * one expression; each action as a single expression. One pass = every
 * action of the template, all units concurrently.
 */
import type { EvaluatorNode } from '../v2-src/types'
import { finish, runCase, section, type Sweep } from './harness'
import {
  actionData,
  actionUnits,
  actionsV2,
  actionsV3,
  fresh,
  newV2,
  newV3,
  type Granularity,
  type Unit,
} from './real-world/fixtures'

/** One line for the bench list and the browser index. */
export const description =
  "The same Conforma template's 19 back-end actions: every action of one event per pass."

const all = (units: Unit[], run: (unit: Unit) => Promise<unknown>) => Promise.all(units.map(run))

const v2 = newV2()
const v3 = newV3()

const row = (label: string, granularity: Granularity, iterations: number) => {
  const unitsV2 = actionUnits(actionsV2, granularity)
  const unitsV3 = actionUnits(actionsV3, granularity)
  return {
    label: `${label} (${unitsV3.length} units)`,
    iterations,
    arms: {
      v2: () => all(unitsV2, (u) => v2.evaluate(u.expr as EvaluatorNode, { data: actionData })),
      // Loaded from the database per event: same bytes, new objects
      'v3 content': () => all(unitsV3, (u) => v3.evaluate(fresh(u.expr), { data: actionData })),
      // The first event after startup: one instance, every unit compiled once
      'v3 cold': () => {
        const cold = newV3()
        return all(unitsV3, (u) => cold.evaluate(u.expr, { data: actionData }))
      },
    },
  }
}

const sweep: Sweep = {
  title: 'Conforma template actions — every action of one event',
  note: 'Back-end, a global instance. Content is the steady state across events; cold is the first.',
  arms: ['v2', 'v3 content', 'v3 cold'],
  ratios: [
    ['v2', 'v3 content'],
    ['v2', 'v3 cold'],
  ],
}

const main = async () => {
  section(sweep)
  await runCase(sweep, row('every property and query', 'every-leaf', 60))
  await runCase(sweep, row('condition; queries whole', 'params-whole', 60))
  await runCase(sweep, row('each action whole', 'item-whole', 80))
  finish()
}

main()
