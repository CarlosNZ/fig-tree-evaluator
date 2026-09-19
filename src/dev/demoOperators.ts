/**
 * Stand-in operators for the dev playground, registered beside
 * `coreOperators` (src/dev/inspect.ts). They model the shapes core does not
 * yet hold: optional trailing slots carrying defaults, and a
 * `timeoutParam`. Canonical names match the real core set where a real
 * operator is being modelled; the bodies are no-ops.
 * Each entry is deleted when its real operator lands (Phases 5–9); the file
 * goes with the last of them.
 */
import { defineOperator } from '../index'
import type { ValidatedOperatorDefinition } from '../index'

const noop = async () => null

/** Optional trailing slots carrying defaults, and a `number` receiver. */
const clampOp = defineOperator({
  name: 'clamp',
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

/** I/O: one positional slot, `timeoutParam`, caching on by metadata. */
const httpOp = defineOperator({
  name: 'http',
  description: 'HTTP request',
  parameters: {
    url: { type: 'string' },
    query: { type: 'object', required: false },
    requestTimeout: { type: 'integer', required: false },
  },
  positionalParams: ['url'],
  timeoutParam: 'requestTimeout',
  useCache: true,
  evaluate: noop,
})

export const demoOperators = (): ValidatedOperatorDefinition[] => [clampOp, httpOp]
