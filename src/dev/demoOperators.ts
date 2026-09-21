/**
 * Stand-in operators for the dev playground, registered beside
 * `coreOperators` (src/dev/inspect.ts). They model shapes core does not
 * hold: here, optional trailing slots carrying defaults. The bodies are
 * no-ops.
 *
 * Each entry is deleted when its real operator lands. The `http` stand-in
 * went with Phase 9, and had to rather than merely could: `inspect.ts`
 * registers these beside `coreOperators`, so once a host adds
 * `httpOperators()` the two `http` definitions collide — the same
 * situation Phase 6 hit with the `map` stand-in. `clamp` models no real
 * operator, so it stays, and the file with it.
 */
import { defineOperator } from '../index'
import type { ValidatedOperatorDefinition } from '../index'

const noop = async () => null

/** Optional trailing slots carrying defaults, and a `number` receiver. */
const clampOp = defineOperator({
  name: 'clamp',
  category: 'math',
  description: 'Constrain a number to a range',
  parameters: {
    value: { type: ['number', 'null'] },
    min: { type: 'number', default: 0 },
    max: { type: 'number', default: 1 },
  },
  positionalParams: ['value', 'min', 'max'],
  returns: 'number',
  evaluate: noop,
})

export const demoOperators = (): ValidatedOperatorDefinition[] => [clampOp]
