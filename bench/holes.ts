/**
 * Claim 1 — O(holes) per evaluation, and claim 4 — the floor
 * (implementation plan, Phase 17a.2).
 *
 * "A large config object compiles to a constant skeleton plus a list of
 * evaluable holes, and each evaluation touches only the holes"
 * (docs-dev/v3-specs/v3-api.md), against v2's `evaluateFullObject`, which
 * re-walks the whole object every time. The floor claim rides along in
 * the cold arm: "worst case (all layers miss, recompile per call) is
 * still roughly v2's baseline" (docs-dev/v3-specs/v3-implementation-
 * notes.md).
 *
 * The claim is about a *shape*, not a single number, so one timing proves
 * nothing: a v3 that were uniformly slower would still look flat. Two
 * sweeps are therefore needed, and the claim survives only if both hold.
 *
 *   Sweep A — static bulk grows, holes fixed. v3 should be flat: the extra
 *   sections are constant skeleton and no evaluation touches them. v2
 *   should grow linearly, because every field is re-walked.
 *
 *   Sweep B — holes grow, static bulk fixed. v3 should grow with the hole
 *   count, which is what O(holes) *means*. A v3 that were flat here would
 *   not be evaluating.
 *
 * Data changes every iteration, so no result can be reused by either side.
 */
import { FigTreeEvaluator } from '../v2-src'
import { FigTree, coreOperators } from '../src'
import { finish, note, runCase, section, type Sweep } from './harness'
import { config, data, holeV2, holeV3 } from './shapes'

/** One line for the bench list and the browser index. */
export const description =
  'Evaluating a mostly-static config: does the cost track the number of expressions, not the size of what surrounds them?'

const v2 = new FigTreeEvaluator({ evaluateFullObject: true })
const v3 = new FigTree({ operators: [coreOperators] })

const row = (label: string, sections: number, holes: number, iterations: number) => {
  const treeV2 = config(sections, holes, holeV2)
  const treeV3 = config(sections, holes, holeV3)
  return {
    label,
    iterations,
    arms: {
      v2: (i: number) => v2.evaluate(treeV2, { data: data(i) }),
      'v3 identity': (i: number) => v3.evaluate(treeV3, { data: data(i) }),
      'v3 content': (i: number) => v3.evaluate({ ...treeV3 }, { data: data(i) }),
      'v3 cold': (i: number) =>
        new FigTree({ operators: [coreOperators] }).evaluate(treeV3, { data: data(i) }),
    },
  }
}

const arms = ['v2', 'v3 identity', 'v3 content', 'v3 cold']
const ratios: [string, string][] = [
  ['v2', 'v3 identity'],
  ['v2', 'v3 cold'],
]

const sweepA: Sweep = {
  title: 'Sweep A — static bulk grows, holes fixed',
  note: 'The claim: v3 flat (extra sections are skeleton), v2 linear in sections.',
  arms,
  ratios,
}

const sweepB: Sweep = {
  title: 'Sweep B — holes grow, static bulk fixed at 200 sections',
  note: 'The claim: v3 grows with holes. Flat here would mean it is not evaluating.',
  arms,
  ratios,
}

/** What a bare instance costs, so the cold arm can be read net of it. */
const instanceCost = () => {
  const iterations = 5000
  let best = Infinity
  for (let r = 0; r < 5; r++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) new FigTree({ operators: [coreOperators] })
    best = Math.min(best, ((performance.now() - start) * 1e6) / iterations)
  }
  return best
}

const main = async () => {
  section(sweepA)
  await runCase(sweepA, row('1 section · 1 hole', 1, 1, 2000))
  await runCase(sweepA, row('10 sections · 4 holes', 10, 4, 1000))
  await runCase(sweepA, row('50 sections · 4 holes', 50, 4, 600))
  await runCase(sweepA, row('200 sections · 4 holes', 200, 4, 300))
  await runCase(sweepA, row('1000 sections · 4 holes', 1000, 4, 80))

  section(sweepB)
  await runCase(sweepB, row('1 hole', 200, 1, 300))
  await runCase(sweepB, row('4 holes', 200, 4, 300))
  await runCase(sweepB, row('16 holes', 200, 16, 300))
  await runCase(sweepB, row('64 holes', 200, 64, 150))

  note(
    `Constant overhead inside the cold arm: new FigTree() costs ` +
      `${(instanceCost() / 1000).toFixed(2)} µs, the same at every row.`
  )
  finish()
}

main()
