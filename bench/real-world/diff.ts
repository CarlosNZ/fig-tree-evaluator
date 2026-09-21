/**
 * Every unit of the Conforma corpus, evaluated on both engines and
 * compared — the migration's own check, finer than the bench harness's.
 * The harness stops at the first disagreement; this prints all of them,
 * which is what you want when changing migrate.ts or the fixture data.
 *
 *   pnpm exec tsx --tsconfig tsconfig.bench.json bench/real-world/diff.ts
 *
 * Not a bench, so not listed by `pnpm bench`.
 */
import type { EvaluatorNode } from '../../v2-src/types'
import { deepEqual } from '../../src'
import {
  actionData,
  actionUnits,
  actionsV2,
  actionsV3,
  elementData,
  elementUnits,
  elementsV2,
  elementsV3,
  newV2,
  newV3,
} from './fixtures'

const main = async () => {
  const v2 = newV2()
  const v3 = newV3()
  const corpora = [
    [
      'elements',
      elementUnits(elementsV2, 'every-leaf'),
      elementUnits(elementsV3, 'every-leaf'),
      elementData('amox'),
    ],
    [
      'actions',
      actionUnits(actionsV2, 'every-leaf'),
      actionUnits(actionsV3, 'every-leaf'),
      actionData,
    ],
  ] as const
  for (const [name, unitsV2, unitsV3, data] of corpora) {
    let differing = 0
    for (let i = 0; i < unitsV2.length; i++) {
      const a = await v2
        .evaluate(unitsV2[i].expr as EvaluatorNode, { data })
        .catch((e: Error) => `V2 ERROR ${e.message}`)
      const b = await v3
        .evaluate(unitsV3[i].expr, { data })
        .catch((e: Error) => `V3 ERROR ${e.message}`)
      if (deepEqual(a, b)) continue
      differing++
      console.log(`\n[${name}] ${unitsV2[i].label}`)
      console.log(`  v2: ${JSON.stringify(a)?.slice(0, 300)}`)
      console.log(`  v3: ${JSON.stringify(b)?.slice(0, 300)}`)
    }
    console.log(`\n${name}: ${differing} of ${unitsV2.length} units differ`)
  }
}

main()
