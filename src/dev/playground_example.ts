/**
 * Scratch space for development — run it with `pnpm dev`.
 *
 * Don't edit this file: `pnpm dev` copies it to src/dev/playground.ts (once,
 * if that file is absent) and runs the copy. The copy is gitignored, so it
 * is yours to wreck.
 *
 * `inspect()` prints every intermediate form of one expression: the
 * compiled tree, the artifact's precomputations, the two check passes, and
 * the public `validate()` result. See src/dev/inspect.ts for what each
 * section means, `pnpm dev examples` for a gallery of worked cases, and
 * `pnpm dev phase4_showcase` (one per phase) for the features running.
 *
 * The registry is `coreOperators` plus the demo stand-ins for shapes core
 * does not yet hold (src/dev/demoOperators.ts, no-op bodies). `evaluate()`
 * exists from Phase 4 — try `new FigTree().evaluate(expression, { data })`
 * beside the inspector.
 */
import { inspect } from './inspect'

const expression = {
  operator: 'format',
  template: 'Hello %1, you have %2 orders',
  substitutions: ['$data.user.name', { $plus: ['$data.orders[0].count', 1] }],
}

inspect(expression, {
  label: 'playground',
  // Sample data is optional: supplied, validate() warns about any recorded
  // $data path that is absent from it
  data: { user: { name: 'Iron Man' } },
  // Your own operators instead of the demo set:
  // operators: [myOperator],
})
