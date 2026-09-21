/**
 * Claim 5 — the constancy probe skips the parse for inert values
 * ("Skip the parse for inert inputs" in
 * docs-dev/v3-specs/v3-implementation-notes.md), whose measurement in
 * September 2026 was against v3's own parser and never against v2. The
 * spec pins the property here: "a performance property, pinned at Phase
 * 16, not by a unit test".
 *
 * The workload is the one that motivated the probe: a Conforma form has
 * ~800 evaluable values, ~90% of them plain static data — labels,
 * numbers, booleans, options lists — each handed to the evaluator on its
 * own. So this bench evaluates single inert values, not a config.
 *
 * That makes v2's shallow default the honest comparison, and it is the
 * `v2` arm: what the claim says v2 did was return such a value untouched
 * after a type check. `v2 deep` is the same value under
 * evaluateFullObject, included because it is what a host evaluating a
 * whole config would have been running, and the gap between the two is
 * most of v2's cost here.
 *
 * Two v3 subtleties the arms expose rather than hide. An inert *primitive*
 * takes neither cache layer (a WeakMap cannot key one) and an inert
 * container takes the identity layer only, so nothing here is ever served
 * by the content layer — the `v3 content` arm is measuring an identity
 * miss on an inert container, which is a real case (a host handing over a
 * freshly parsed options list each render) but is not a content hit.
 *
 * And unlike every other bench, the two non-identity arms here carry
 * overhead large enough to distort them, because the values are flat: the
 * fresh object a content arm needs is a spread of a 2000-key object, not
 * of a 3-key one, and the cold arm's instance build is most of what a
 * cold inert evaluation costs at all. Both are measured and printed below
 * so those columns can be read net of them.
 */
import { FigTreeEvaluator } from '../v2-src'
import type { EvaluatorNode } from '../v2-src/types'
import { FigTree, coreOperators } from '../src'
import { finish, note, runCase, section, type Sweep } from './harness'

/** One line for the bench list and the browser index. */
export const description =
  'Plain values with nothing in them to evaluate, handed over one at a time.'

const options = (entries: number) =>
  Array.from({ length: entries }, (_, i) => ({ label: `Option ${i}`, value: i, group: 'x' }))

/** A 2000-field config of pure static data — no operator anywhere. */
const staticConfig = Object.fromEntries(
  Array.from({ length: 2000 }, (_, i) => [`field${i}`, i % 3 === 0 ? `text ${i}` : i])
)

const v2shallow = new FigTreeEvaluator({})
const v2deep = new FigTreeEvaluator({ evaluateFullObject: true })
const v3 = new FigTree({ operators: [coreOperators] })

const row = (
  label: string,
  value: EvaluatorNode,
  fresh: () => EvaluatorNode,
  iterations: number
) => ({
  label,
  iterations,
  arms: {
    v2: () => v2shallow.evaluate(value),
    'v2 deep': () => v2deep.evaluate(value),
    'v3 identity': () => v3.evaluate(value),
    'v3 content': () => v3.evaluate(fresh()),
    'v3 cold': () => new FigTree({ operators: [coreOperators] }).evaluate(value),
  },
})

const sweep: Sweep = {
  title: 'Inert values — nothing to evaluate, handed over one at a time',
  note: 'The claim: the probe bails on first sight, so v3 need not parse what it cannot evaluate.',
  arms: ['v2', 'v2 deep', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [['v2', 'v3 identity']],
}

const twenty = options(20)
const twoHundred = options(200)

/** Min-of-five cost of one call, in microseconds. */
const cost = (iterations: number, run: () => unknown) => {
  let best = Infinity
  for (let r = 0; r < 5; r++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) void run()
    best = Math.min(best, ((performance.now() - start) * 1e6) / iterations)
  }
  return best / 1000
}

const shapes: [string, EvaluatorNode, () => EvaluatorNode, number][] = [
  ['static string', 'Applicant name', () => 'Applicant name', 4000],
  ['20-entry options', twenty, () => [...twenty], 2000],
  ['200-entry options', twoHundred, () => [...twoHundred], 800],
  ['2000 static fields', staticConfig, () => ({ ...staticConfig }), 200],
]

const main = async () => {
  section(sweep)
  for (const [label, value, fresh, iterations] of shapes)
    await runCase(sweep, row(label, value, fresh, iterations))

  const clones = shapes
    .map(([label, , fresh]) => `${label} ${cost(2000, fresh).toFixed(2)} µs`)
    .join(', ')
  note(`Building the fresh value, inside 'v3 content': ${clones}.`)
  note(
    `Building the instance, inside 'v3 cold': ` +
      `${cost(5000, () => new FigTree({ operators: [coreOperators] })).toFixed(2)} µs.`
  )
  finish()
}

main()
