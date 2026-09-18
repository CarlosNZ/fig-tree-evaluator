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

/** A literal empty `values` where an identity exists: a dead expression. */
export const emptyAggregateWarning = (literalParams: Record<string, unknown>): ValidateFinding[] =>
  Array.isArray(literalParams.values) && literalParams.values.length === 0
    ? [
        {
          severity: 'warning',
          parameter: 'values',
          message: 'an empty values array is a dead expression — the result is always the identity',
        },
      ]
    : []

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
