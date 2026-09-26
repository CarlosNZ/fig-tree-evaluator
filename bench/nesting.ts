/**
 * Deep nesting — a scale case rather than a claim (implementation plan,
 * Phase 17a.2). It exists to check that nothing degrades non-linearly
 * with depth on either engine, and to sit beside bench/parseOnce.ts:
 * that one grows an expression sideways at a fixed depth of three, this
 * one grows it downwards with one operator per level. Comparing the two
 * at equal node counts says whether either engine pays for recursion
 * beyond what it pays per node.
 *
 * v3's built-in ceiling is 500 levels of descent and an operator node
 * spends more than one of them, so the deepest row here stays well under
 * it. v2 has no ceiling at all, which is its own small finding: the
 * bottom of this sweep is where a v2 host would have got a stack
 * overflow instead of an error message.
 */
import { FigTreeEvaluator } from '../v2-src'
import type { EvaluatorNode } from '../v2-src/types'
import { FigTree, coreOperators } from '../src'
import { finish, runCase, section, type Sweep } from './harness'

/** One line for the bench list and the browser index. */
export const description = 'Deeply nested expressions — one operator per level, down to 160.'

/** `((((a + 1) + 1) + 1) … )` — one operator per level of depth. */
const chainV3 = (depth: number) => {
  let node: unknown = '$data.a'
  for (let i = 0; i < depth; i++) node = { $plus: [node, 1] }
  return node as object
}

const chainV2 = (depth: number) => {
  let node: EvaluatorNode = { operator: 'objectProperties', property: 'a' }
  for (let i = 0; i < depth; i++) node = { operator: 'plus', values: [node, 1] }
  return node
}

const data = (i: number) => ({ a: i % 7 })

const v2 = new FigTreeEvaluator({ evaluateFullObject: true })
const v3 = new FigTree({ operators: [coreOperators] })

const row = (label: string, depth: number, iterations: number) => {
  const treeV2 = chainV2(depth)
  const treeV3 = chainV3(depth)
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
  title: 'Nesting depth grows, one operator node per level',
  note: 'Linear in depth is the expected result; anything steeper is the finding.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [
    ['v2', 'v3 identity'],
    ['v2', 'v3 cold'],
  ],
}

const main = async () => {
  section(sweep)
  await runCase(sweep, row('10 deep', 10, 2000))
  await runCase(sweep, row('40 deep', 40, 800))
  await runCase(sweep, row('100 deep', 100, 400))
  await runCase(sweep, row('160 deep', 160, 250))
  finish()
}

main()
