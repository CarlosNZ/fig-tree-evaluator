/**
 * Claim 2 — parse-once, O(1) thereafter (implementation plan, Phase
 * 16a.2). "Recognition, alias normalization and positional mapping happen
 * at parse and never again" ("Ruling: no `v2Compat` runtime flag" in
 * docs-dev/v3-specs/v3-migration.md).
 *
 * bench/holes.ts cannot answer this. Its v2 column is dominated by the
 * cost of re-walking hundreds of static sections, which hides whatever v2
 * pays per *operator node* for recognizing it afresh on every visit. So
 * this bench strips the static bulk out entirely: the expression is
 * nothing but operator nodes, each doing trivial arithmetic, and the axis
 * is how many of them there are.
 *
 * `plus` is the operator rather than `and` deliberately. Every operand of
 * a sum must be evaluated, so both engines do identical work; `and` would
 * let v3 cancel operands once the result is decided, which is real but is
 * claim 7's measurement, not this one.
 *
 * What the claim predicts: v2's per-call cost carries a recognition
 * component that grows with node count and is paid again every
 * evaluation, where v3's identity arm pays it once ever. The gap between
 * the identity and cold arms is that component, priced.
 */
import { FigTreeEvaluator } from '../v2-src'
import { FigTree, coreOperators } from '../src'
import { finish, runCase, section, type Sweep } from './harness'

/** `(a + 1) + (a + 1) + …` — n operand nodes, all of which must run. */
const sumV3 = (nodes: number) => ({
  $plus: Array.from({ length: nodes }, () => ({ $plus: ['$data.a', 1] })),
})

const sumV2 = (nodes: number) => ({
  operator: 'plus',
  values: Array.from({ length: nodes }, () => ({
    operator: 'plus',
    values: [{ operator: 'objectProperties', property: 'a' }, 1],
  })),
})

/** `a + a + …` — one operator node, n data references under it. */
const flatV3 = (nodes: number) => ({
  $plus: Array.from({ length: nodes }, () => '$data.a'),
})

const flatV2 = (nodes: number) => ({
  operator: 'plus',
  values: Array.from({ length: nodes }, () => ({
    operator: 'objectProperties',
    property: 'a',
  })),
})

const data = (i: number) => ({ a: i % 7 })

const v2 = new FigTreeEvaluator({ evaluateFullObject: true })
const v3 = new FigTree({ operators: [coreOperators] })

const row = (
  label: string,
  nodes: number,
  iterations: number,
  shape: 'nested' | 'flat' = 'nested'
) => {
  const treeV2 = shape === 'nested' ? sumV2(nodes) : flatV2(nodes)
  const treeV3 = shape === 'nested' ? sumV3(nodes) : flatV3(nodes)
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

const sweep: Sweep = {
  title: 'Operator nodes grow, no static bulk at all',
  note: 'The claim: v2 re-recognizes every node per call; v3 recognized them once, ever.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [
    ['v2', 'v3 identity'],
    ['v2', 'v3 cold'],
  ],
}

/**
 * The same operand counts with the nesting removed: one `plus` node over
 * n data references, where sweep A had n+1 `plus` nodes over the same n
 * references. Comparing the two at equal n separates what each engine
 * spends per operator node from what it spends per data read.
 */
const flat: Sweep = {
  title: 'Same reads, one operator node instead of n+1',
  note: 'The difference from sweep A, at equal n, is the per-operator-node cost.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [
    ['v2', 'v3 identity'],
    ['v2', 'v3 cold'],
  ],
}

const main = async () => {
  section(sweep)
  await runCase(sweep, row('5 operands (11 nodes)', 5, 2000))
  await runCase(sweep, row('20 operands (41 nodes)', 20, 1000))
  await runCase(sweep, row('80 operands (161 nodes)', 80, 400))
  await runCase(sweep, row('320 operands (641 nodes)', 320, 150))

  section(flat)
  await runCase(flat, row('5 reads (1 node)', 5, 2000, 'flat'))
  await runCase(flat, row('20 reads (1 node)', 20, 1000, 'flat'))
  await runCase(flat, row('80 reads (1 node)', 80, 400, 'flat'))
  await runCase(flat, row('320 reads (1 node)', 320, 150, 'flat'))
  finish()
}

main()
