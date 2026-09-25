/**
 * Large trees — the scale case (implementation plan, Phase 17a.2).
 *
 * The plan names the 20,000-node `massiveQuery` corpus here, on the
 * grounds that codegen/queryBuilder.ts is ours and could grow a v3 arm.
 * On inspection it cannot, not in 17a: its base expressions lean on
 * `outputType`, `type`, `funcName`, `passThru` and positional `children`,
 * which is converter work rather than a change of spelling, and exactly
 * what 17b exists for. Hand-translating them would produce a v3 tree
 * nobody had checked against the recorded v2 result — the dishonesty the
 * split was drawn to avoid.
 *
 * So this builds its own large tree instead, in both spellings from one
 * shared shape, the way every other 17a bench does. What it is for is
 * not the ratio — three benches have already priced a node on each
 * engine — but the question those cannot answer: whether anything
 * degrades non-linearly once a tree is thousands of nodes rather than
 * hundreds. Caches sized for a working set, an LRU bounded at 200, one
 * abort listener per node: all of them are fine at the sizes measured so
 * far, and the point here is to find out whether they stay fine.
 *
 * A balanced tree rather than a chain (bench/nesting.ts covers depth), of
 * `plus` nodes over numeric leaves, with every fifth subtree wrapped in a
 * conditional whose branch always holds. Both engines evaluate only the
 * taken branch, so the wrapper costs each the same — it is there for
 * shape, not to test laziness, which is parity.
 */
import { FigTreeEvaluator } from '../v2-src'
import type { EvaluatorNode } from '../v2-src/types'
import { FigTree, coreOperators } from '../src'
import { finish, note, runCase, section, type Sweep } from './harness'

/** One line for the bench list and the browser index. */
export const description =
  'One very large expression, watching the cost per node for a knee as it grows to 8,000 nodes.'

/** Builds a tree of roughly `nodes` operator nodes, in either spelling. */
const build = (nodes: number, v3: boolean, seed = 0): unknown => {
  if (nodes <= 1) {
    if (seed % 3 === 0) return v3 ? '$data.a' : { operator: 'objectProperties', property: 'a' }
    return seed % 7
  }
  const left = Math.floor((nodes - 1) / 2)
  const sum = v3
    ? { $plus: [build(left, v3, seed + 1), build(nodes - 1 - left, v3, seed + 2)] }
    : {
        operator: 'plus',
        values: [build(left, v3, seed + 1), build(nodes - 1 - left, v3, seed + 2)],
      }
  // Every fifth subtree gets a conditional whose condition always holds,
  // so both engines take the same branch and do the same work.
  if (seed % 5 !== 0) return sum
  return v3
    ? { $if: [{ $notEqual: ['$data.a', 99] }, sum, 0] }
    : {
        operator: 'conditional',
        condition: {
          operator: 'notEqual',
          values: [{ operator: 'objectProperties', property: 'a' }, 99],
        },
        valueIfTrue: sum,
        valueIfFalse: 0,
      }
}

const data = (i: number) => ({ a: i % 7 })

const v2 = new FigTreeEvaluator({ evaluateFullObject: true })
const v3 = new FigTree({ operators: [coreOperators] })

const row = (label: string, nodes: number, iterations: number) => {
  const treeV2 = build(nodes, false) as EvaluatorNode
  const treeV3 = build(nodes, true) as object
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
  title: 'One tree, grown to thousands of nodes',
  note: 'Looking for a knee, not a ratio: per-node cost should hold steady all the way up.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [['v2', 'v3 identity']],
}

const main = async () => {
  section(sweep)
  const rows: [string, number, number][] = [
    ['500 nodes', 500, 120],
    ['2000 nodes', 2000, 40],
    ['8000 nodes', 8000, 12],
  ]
  const timings: Record<string, number>[] = []
  for (const [label, nodes, iterations] of rows)
    timings.push(await runCase(sweep, row(label, nodes, iterations)))

  // runCase reports nanoseconds; these are microseconds per operator node.
  const perNode = (arm: string) =>
    rows
      .map(([label, nodes], i) => `${label} ${(timings[i][arm] / nodes / 1000).toFixed(2)}`)
      .join(', ')
  note(
    `Microseconds per node — v3 identity: ${perNode('v3 identity')}; v2: ${perNode('v2')}. ` +
      `A rising figure is the knee this bench is looking for.`
  )
  finish()
}

main()
