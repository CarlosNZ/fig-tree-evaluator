/**
 * Claim 3 — instance churn costs one serialize+hash, then O(1)
 * (implementation plan, Phase 17a.2). "A content hit re-registers under
 * the new object's identity, so that object pays one serialization and is
 * O(1) from then on" (src/parse/parseCache.ts; "Cache keying for
 * non-identical inputs" in docs-dev/v3-specs/v3-implementation-notes.md).
 *
 * The content layer was already measured at #161, but against v3's own
 * reparse: 6-8x for expression-dense input, 1.2-1.6x mostly-static, and
 * an inversion for a large opaque payload behind a single hole, where a
 * content hit costs *more* than simply recompiling. The claim, though, is
 * about surviving the churn that a React or per-request host produces,
 * and the thing it has to beat there is v2 — which has no parse cache at
 * all and re-walks everything every time. That column is what is missing,
 * and it is what this bench adds.
 *
 * The axis is shape rather than size, because the discriminator #161
 * found is static bytes per hole: the content key's cost tracks input
 * bytes, every one serialized and then hashed, while the compile it
 * replaces tracks evaluable nodes. Three shapes span that ratio.
 */
import { FigTreeEvaluator } from '../v2-src'
import type { EvaluatorNode } from '../v2-src/types'
import { FigTree, coreOperators } from '../src'
import { finish, runCase, section, type Sweep } from './harness'
import { config, holeV2, holeV3 } from './shapes'

/** One line for the bench list and the browser index. */
export const description =
  'Being handed a fresh copy of the same config each time — how the content cache fares on three shapes.'

const data = (i: number) => ({
  user: { isAdmin: i % 2 === 0 },
  stage: i % 3 === 0 ? 'draft' : 'live',
  a: i % 7,
})

/** Almost all holes: 40 operator nodes, nothing static to speak of. */
const denseV3 = { $plus: Array.from({ length: 40 }, () => ({ $plus: ['$data.a', 1] })) }
const denseV2 = {
  operator: 'plus',
  values: Array.from({ length: 40 }, () => ({
    operator: 'plus',
    values: [{ operator: 'objectProperties', property: 'a' }, 1],
  })),
}

/** The everyday config: a lot of static, a handful of holes. */
const formV3 = config(200, 4, holeV3)
const formV2 = config(200, 4, holeV2)

/** The inversion case: one hole, ~100 kB of opaque static behind it. */
const payload = 'lorem ipsum dolor sit amet, consectetur adipiscing. '.repeat(2000)
const blobV3 = { visible: holeV3, content: payload }
const blobV2 = { visible: holeV2, content: payload }

const v2 = new FigTreeEvaluator({ evaluateFullObject: true })
const v3 = new FigTree({ operators: [coreOperators] })

const row = (label: string, treeV2: EvaluatorNode, treeV3: object, iterations: number) => ({
  label,
  iterations,
  arms: {
    v2: (i: number) => v2.evaluate(treeV2, { data: data(i) }),
    'v3 identity': (i: number) => v3.evaluate(treeV3, { data: data(i) }),
    'v3 content': (i: number) => v3.evaluate({ ...treeV3 }, { data: data(i) }),
    'v3 cold': (i: number) =>
      new FigTree({ operators: [coreOperators] }).evaluate(treeV3, { data: data(i) }),
  },
})

const sweep: Sweep = {
  title: 'Churn shapes — the content layer against v2, and against a reparse',
  note: 'The discriminator is static bytes per hole. v3 content / v3 cold is the #161 ratio.',
  arms: ['v2', 'v3 identity', 'v3 content', 'v3 cold'],
  ratios: [
    ['v2', 'v3 content'],
    ['v3 cold', 'v3 content'],
  ],
}

const main = async () => {
  section(sweep)
  await runCase(sweep, row('expression-dense (40 ops)', denseV2, denseV3, 600))
  await runCase(sweep, row('mostly-static form (200)', formV2, formV3, 300))
  await runCase(sweep, row('one hole + 100 kB blob', blobV2, blobV3, 400))
  finish()
}

main()
