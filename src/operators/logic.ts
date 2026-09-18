/**
 * Batch 1 — Logic & control ("Logic & control" in
 * docs-dev/v3-specs/v3-operator-parameters.md). The operators that forced
 * laziness into the ledger: each one's contract is that work it did not
 * choose never happens, so a branch not taken never fires its request.
 *
 * Every body here is control flow over handles. The engine owns which
 * elements or entries are addressable, when each is evaluated, and what
 * layers it passes on the way out — so these read as the semantics and
 * nothing else.
 */
import { defineOperator } from '../defineOperator'
import { OperatorFailure } from '../OperatorFailure'
import { renderText } from '../primitives'
import { emptyAggregateWarning } from './shared'

/**
 * Exported as `ifOperator` — `if` is a reserved word. The canonical
 * operator name is unaffected; only this binding is renamed.
 */
export const ifOperator = defineOperator({
  name: 'if',
  alias: '?',
  description: 'Choose between two branches — only the chosen branch evaluates',
  parameters: {
    condition: {
      type: 'any',
      truthiness: true,
      description: 'Judged by FigTree truthiness; null is falsy',
    },
    then: {
      type: 'any',
      evaluation: 'lazy',
      description: 'The value when the condition holds',
    },
    else: {
      type: 'any',
      evaluation: 'lazy',
      default: null,
      description: 'The value when it does not; omitted means null',
    },
  },
  positionalParams: ['condition', 'then', 'else'],
  evaluate: ({ condition, then, else: otherwise }) =>
    condition ? then.evaluate() : otherwise.evaluate(),
})

export const match = defineOperator({
  name: 'match',
  description: 'Dispatch on a value — only the matching branch evaluates',
  parameters: {
    value: {
      type: ['string', 'number', 'boolean', 'null'],
      nullPolicy: 'value',
      description: 'Matched against branch keys by its canonical string form',
    },
    branches: {
      type: 'object',
      evaluation: 'lazyEntries',
      description: 'A literal map of branches, or an expression computing one',
    },
    default: {
      type: 'any',
      required: false,
      evaluation: 'lazy',
      description: 'The branch taken when none matches; absent means failure',
    },
  },
  positionalParams: ['value', 'branches', 'default'],
  evaluate: ({ value, branches, default: fallbackBranch }) => {
    // Branch keys are JSON object keys, hence always strings: `value: 1`
    // matches the key '1'. A null value matches no branch — deliberately
    // not the '' key — and falls to the default
    const key = value === null ? null : renderText(value)
    // Own keys only: a value of 'toString' or 'constructor' must not find
    // a branch nobody wrote
    if (key !== null && Object.hasOwn(branches, key)) return branches[key].evaluate()
    if (fallbackBranch !== undefined) return fallbackBranch.evaluate()
    throw new OperatorFailure(
      `no branch matches ${key === null ? 'null' : `'${key}'`}, and no default was supplied`
    )
  },
})

export const firstOf = defineOperator({
  name: 'firstOf',
  description:
    'The first candidate that is not null (SQL COALESCE) — later candidates never evaluate',
  parameters: {
    values: {
      type: 'array',
      evaluation: 'lazyElements',
      description: 'Candidates, tried in order; only null is skipped',
    },
  },
  positionalParams: ['...values'],
  validate: emptyAggregateWarning,
  evaluate: async ({ values }) => {
    for (const candidate of values) {
      // Sequencing is semantics, not optimization: a backup request must
      // not fire when the primary answered. A candidate that *fails* fails
      // the node — firstOf skips nulls, not errors
      const value = await candidate.evaluate()
      if (value !== null) return value
    }
    // All-null and empty alike: absence in, absence out
    return null
  },
})
