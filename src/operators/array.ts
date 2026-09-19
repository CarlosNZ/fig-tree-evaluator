/**
 * Batch 5 — Arrays & iteration ("Batch 5" in
 * docs-dev/v3-specs/v3-operator-parameters-2.md): `length`, one measure
 * over two carriers, and the five iterators, one contract over five
 * decision rules.
 *
 * What the iterators share is everything except the decision: a collection
 * at `input`, one expression at `each` stamped over its elements, and the
 * optional `as` renaming. The engine owns the hard parts — which index is
 * addressable, the fresh binding scope per element, the per-index memo,
 * the layers each result passes — so the bodies below are decision rules
 * and nothing else.
 *
 * Elements evaluate in parallel, always. They are homogeneous data, not a
 * priority chain: the transforms need every element on every path, and the
 * deciders reuse `and` / `or`'s early resolution rather than serializing.
 * The contrast is `firstOf`, whose candidates are alternatives that must
 * not all fire. One consequence worth stating plainly: every element's
 * evaluation STARTS, so order-dependent or skip-dependent side effects do
 * not belong in an `each`.
 */
import { defineOperator } from '../defineOperator'
import { toCodePoints } from '../primitives'
import type { Settlement } from '../runtimeInterface'
import { collectAll, decide, emptyInputWarning } from './shared'

export const length = defineOperator({
  name: 'length',
  description: "An array's element count, or a string's Unicode code-point count",
  parameters: {
    value: {
      type: ['string', 'array', 'null'],
      description: 'The array or string measured',
    },
  },
  positionalParams: ['...value'],
  returns: 'integer',
  evaluate: ({ value }) => (typeof value === 'string' ? toCodePoints(value).length : value.length),
})

// ── the iterators: one contract, five operators ─────────────────────

/**
 * The shared shape. `input` admits `array` alone, so a null collection is
 * an ordinary runtime type error rather than a quiet vacuous answer — the
 * flip recorded as row 24 of the gradient register. `nullInputDefault` is
 * the declared softener: an engine-side replacement (`replacesNullAt`)
 * applied before the type check, so supplying it means no error at all,
 * and `[]` reads absence as emptiness.
 *
 * Spelled as `const` objects rather than built by a factory, because the
 * body's `params` type is inferred from these literals — a factory's
 * return type widens `evaluation` to `string` and the handle types are
 * lost.
 */
const commonParams = {
  input: {
    type: 'array',
    description: 'The collection iterated over; a null input is a type error',
  },
  as: {
    type: 'string',
    required: false,
    evaluation: 'structural',
    description: "Rename the bindings: as: 'row' binds $row and $rowIndex",
  },
  nullInputDefault: {
    type: 'array',
    required: false,
    evaluation: 'lazy',
    replacesNullAt: ['input'],
    description: 'Used as the collection when input evaluates to null — typically []',
  },
} as const

/** `map`'s `each` takes any value; the other four judge truthiness. */
const transformEach = {
  type: 'any',
  evaluation: 'perElement',
  over: 'input',
  description: 'Evaluated per element, with $element and $index bound',
} as const

const predicateEach = {
  ...transformEach,
  truthiness: true,
  description: 'The predicate, per element — a truthiness position, so null is falsy',
} as const

export const map = defineOperator({
  name: 'map',
  description: 'Transform every element of an array',
  parameters: { ...commonParams, each: transformEach },
  positionalParams: ['input', 'each'],
  returns: 'array',
  validate: emptyInputWarning,
  evaluate: ({ each }) => collectAll(each.settle()),
})

export const filter = defineOperator({
  name: 'filter',
  description: 'Keep the elements of an array whose predicate is truthy',
  parameters: { ...commonParams, each: predicateEach },
  positionalParams: ['input', 'each'],
  returns: 'array',
  validate: emptyInputWarning,
  // The ORIGINAL elements, never the predicate results, in input order
  evaluate: async ({ input, each }) => {
    const kept = await collectAll(each.settle())
    return input.filter((_, index) => kept[index])
  },
})

/**
 * The one bespoke decision rule. `find` answers with an element rather
 * than a boolean, so WHICH element is part of the answer and completion
 * order must not choose it: the node resolves at the first index whose
 * predicate is truthy, but only once every earlier index is known falsy.
 *
 * Kleene applies by decision-dependence. The result depends on every index
 * up to and including the decider, so a failure at or before it fails the
 * node; failures beyond it are discarded along with the cancelled work.
 *
 * No match is an answer, not a failure — `noMatchDefault`, whose own
 * default is null. It fires on no-match ONLY: a found null element passes
 * through unchanged, which is the distinction a bare null could not carry.
 */
export const find = defineOperator({
  name: 'find',
  description: 'The first element of an array whose predicate is truthy',
  parameters: {
    ...commonParams,
    each: predicateEach,
    noMatchDefault: {
      type: 'any',
      required: false,
      default: null,
      evaluation: 'lazy',
      description: 'The answer when nothing matches; a found null passes through unchanged',
    },
  },
  positionalParams: ['input', 'each'],
  validate: emptyInputWarning,
  evaluate: async ({ input, each, noMatchDefault }) => {
    const outcomes = new Array<Settlement | undefined>(input.length)
    /** The lowest index whose outcome is not yet known; only ever advances. */
    let cursor = 0
    for await (const settled of each.settle()) {
      outcomes[settled.index] = settled
      // Walk forward over everything now known. The scan stops at the
      // first index still out, because that one comes first and could
      // still be the answer
      for (let known = outcomes[cursor]; known !== undefined; known = outcomes[cursor]) {
        if (!known.ok) throw known.error
        // `truthiness` is declared, so the engine has already judged it
        if (known.value === true) return input[cursor]
        cursor += 1
      }
    }
    return noMatchDefault.evaluate()
  },
})

export const some = defineOperator({
  name: 'some',
  description: 'True when any element satisfies the predicate',
  parameters: { ...commonParams, each: predicateEach },
  positionalParams: ['input', 'each'],
  returns: 'boolean',
  validate: emptyInputWarning,
  evaluate: ({ each }) => decide(each.settle(), true),
})

export const every = defineOperator({
  name: 'every',
  description: 'True when every element satisfies the predicate',
  parameters: { ...commonParams, each: predicateEach },
  positionalParams: ['input', 'each'],
  returns: 'boolean',
  validate: emptyInputWarning,
  evaluate: ({ each }) => decide(each.settle(), false),
})
