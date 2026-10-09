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
import { declareOperator } from '../buildOperator'
import { OperatorFailure } from '../OperatorFailure'
import { renderText } from '../primitives'
import { decide, emptyAggregateWarning } from './shared'

/**
 * Exported as `ifOperator` — `if` is a reserved word. The canonical
 * operator name is unaffected; only this binding is renamed.
 */
export const ifOperator = declareOperator({
  name: 'if',
  alias: '?',
  category: 'logic',
  parameters: {
    condition: {
      type: 'any',
      truthiness: true,
    },
    then: {
      type: 'any',
      evaluation: 'lazy',
    },
    else: {
      type: 'any',
      evaluation: 'lazy',
      default: null,
    },
  },
  positionalParams: ['condition', 'then', 'else'],
  evaluate: ({ condition, then, else: otherwise }) =>
    condition ? then.evaluate() : otherwise.evaluate(),
})

export const match = declareOperator({
  name: 'match',
  category: 'logic',
  parameters: {
    value: {
      type: ['string', 'number', 'boolean', 'null'],
      nullPolicy: 'value',
    },
    branches: {
      type: 'object',
      evaluation: 'lazyEntries',
    },
    default: {
      type: 'any',
      required: false,
      evaluation: 'lazy',
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

export const firstOf = declareOperator({
  name: 'firstOf',
  category: 'logic',
  parameters: {
    values: {
      type: 'array',
      evaluation: 'lazyElements',
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

export const and = declareOperator({
  name: 'and',
  category: 'logic',
  parameters: {
    values: {
      type: 'array',
      truthiness: true,
      evaluation: 'race',
    },
  },
  positionalParams: ['...values'],
  returns: 'boolean',
  validate: emptyAggregateWarning,
  evaluate: ({ values }) => decide(values, false),
})

export const or = declareOperator({
  name: 'or',
  category: 'logic',
  parameters: {
    values: {
      type: 'array',
      truthiness: true,
      evaluation: 'race',
    },
  },
  positionalParams: ['...values'],
  returns: 'boolean',
  validate: emptyAggregateWarning,
  evaluate: ({ values }) => decide(values, true),
})

export const not = declareOperator({
  name: 'not',
  alias: '!',
  category: 'logic',
  parameters: {
    value: {
      type: 'any',
      truthiness: true,
    },
  },
  positionalParams: ['value'],
  returns: 'boolean',
  evaluate: ({ value }) => !value,
})
