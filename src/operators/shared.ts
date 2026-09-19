/**
 * Helpers shared by the core definitions: the validate-hook findings for
 * empty literal aggregates (ruled hook-authored at Phase 4 — the
 * empty-literal-aggregate check in "The check inventory",
 * docs-dev/v3-specs/v3-evaluator-methods.md), and the OperatorFailure
 * bodies raise for an empty dynamic aggregate.
 */
import { OperatorFailure } from '../OperatorFailure'
import { ErrorCodes } from '../errorCodes'
import type { ValidateFinding } from '../operatorDefinition'
import type { Settlement, SettlementStream } from '../runtimeInterface'

/** A literal empty `values` where the operator has no identity to return. */
export const emptyAggregateError = (literalParams: Record<string, unknown>): ValidateFinding[] =>
  Array.isArray(literalParams.values) && literalParams.values.length === 0
    ? [
        {
          severity: 'error',
          parameter: 'values',
          message: 'an empty values array has no result — supply at least one value',
        },
      ]
    : []

/** A literal empty array at `parameter` where an identity exists: dead. */
const emptyArrayWarning =
  (parameter: string) =>
  (literalParams: Record<string, unknown>): ValidateFinding[] => {
    const value = literalParams[parameter]
    return Array.isArray(value) && value.length === 0
      ? [
          {
            severity: 'warning',
            parameter,
            message: `an empty ${parameter} array is a dead expression — the result is always the identity`,
          },
        ]
      : []
  }

/** An aggregate's literal empty `values`: the result is always the identity. */
export const emptyAggregateWarning = emptyArrayWarning('values')

/** An iterator's literal empty `input`: a dead loop. */
export const emptyInputWarning = emptyArrayWarning('input')

/** `buildObject`'s literal empty `entries`: the result is always `{}`. */
export const emptyEntriesWarning = emptyArrayWarning('entries')

/** A literal `values` with fewer than two elements on a comparison. */
export const fewerThanTwoWarning = (literalParams: Record<string, unknown>): ValidateFinding[] =>
  Array.isArray(literalParams.values) && literalParams.values.length < 2
    ? [
        {
          severity: 'warning',
          parameter: 'values',
          message: 'fewer than two values is a dead comparison — the result never varies',
        },
      ]
    : []

/** The runtime failure for a dynamically-empty aggregate with no identity. */
export const emptyAggregateFailure = (what: string, hint?: string): OperatorFailure =>
  new OperatorFailure(
    `${what} of nothing — the values array is empty${hint !== undefined ? `; ${hint}` : ''}`,
    { code: ErrorCodes.emptyAggregate }
  )

/** The runtime failure for operands outside an operator's domain. */
export const operandTypeFailure = (message: string): OperatorFailure =>
  new OperatorFailure(message, { code: ErrorCodes.typeCheck })

// ── settlement streams: the two ways a body reads one ───────────────

/**
 * The decider's control flow, shared by `and` / `or` and the quantifiers
 * `some` / `every` — literally one algorithm at two settings.
 *
 * Operands start together and settle in whatever order they finish; the
 * first DECIDING value answers at once, and everything still in flight is
 * cancelled by the engine when the body returns.
 *
 * Failures are parked rather than raised — Kleene's strong logic, and here
 * it is just control flow: a decider returns before the parked pile is
 * ever looked at, so a failure that did not matter never surfaces. Only
 * when nothing decides does the result depend on the failures, and then
 * the LOWEST-INDEX one is raised, not the first to arrive. That is what
 * makes the outcome independent of completion order: timing changes how
 * much work gets cancelled, never the answer.
 *
 * With no elements at all, the identity: `and`/`every` are true, `or`/
 * `some` are false. Vacuous truth, and the two pairs agree.
 */
export const decide = async (values: SettlementStream, decider: boolean): Promise<boolean> => {
  const parked: Settlement[] = []
  for await (const settled of values) {
    // `truthiness` is declared, so the engine has already judged the value
    if (settled.ok && settled.value === decider) return decider
    if (!settled.ok) parked.push(settled)
  }
  if (parked.length > 0) {
    parked.sort((a, b) => a.index - b.index)
    throw parked[0].error
  }
  return !decider
}

/**
 * Every element's value, by index — for the transforms, where there is no
 * decision to make and membership of every element is part of the result.
 *
 * A failure fails the node, and WHICH failure is not left to timing: the
 * lowest-index one is raised, the same rule `decide` applies. It is raised
 * as soon as that index is known to be the lowest — once it has failed and
 * every earlier index has come back clean — so determinism does not cost a
 * wait on elements whose outcome cannot change the answer.
 */
export const collectAll = async (values: SettlementStream): Promise<unknown[]> => {
  const outcomes = new Array<Settlement | undefined>(values.length)
  /** The lowest index whose outcome is not yet known; only ever advances. */
  let cursor = 0
  for await (const settled of values) {
    outcomes[settled.index] = settled
    for (let known = outcomes[cursor]; known !== undefined; known = outcomes[cursor]) {
      if (!known.ok) throw known.error
      cursor += 1
    }
  }
  return outcomes.map((settled) => settled?.value)
}
