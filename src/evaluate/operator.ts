/**
 * The node wrapper — the contract's "node machinery" ("Engine guarantees"
 * in docs-dev/v3-specs/v3-operator-contract.md; "fallback semantics" in
 * docs-dev/v3-specs/v3-api.md): resolve the parameters, run the body,
 * normalize the result at the boundary, and catch failures with the node's
 * `fallback` (authored, else the operator's `operatorDefaults` modifier).
 *
 * Fallback rules 1, 2, 4 and 6 live here. Rule 1 comes free of promise
 * rejection: a failure anywhere in the parameter subtrees rejects this
 * node's attempt, and the nearest enclosing wrapper with a fallback is the
 * first to catch it. Rule 2 needs nothing — static errors never reach
 * evaluation. Rule 4 attaches the original failure as `cause` when the
 * fallback itself fails. Rule 6 holds by construction: a node instance is
 * attempted once, so its fallback runs at most once.
 */
import { FigTreeError, isFigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import { isOperatorFailure } from '../OperatorFailure'
import type { CompiledNode, OperatorNode } from '../parse'
import { isEngineHandle } from '../runtimeInterface'
import { childScope, createOperatorContext, type EvaluationContext } from './context'
import { evaluateNode } from './evaluate'
import { isCancellation, isInternalError } from './internal'
import { resolveParams } from './params'
import { pushVars } from './scope'

export const evaluateOperator = async (
  node: OperatorNode,
  ctx: EvaluationContext
): Promise<unknown> => {
  // One scope over both the attempt and the fallback: rule 5 — a fallback
  // evaluates in its node's own scope, so the node's vars are visible to
  // it, memoized rejections included
  const scoped = pushVars(ctx, node.vars)
  // The ABORT scope is deliberately narrower than the vars scope: it covers
  // the attempt only. A fallback runs *after* the body settled, so a
  // fallback evaluated under this node's own signal would be refused at its
  // first node boundary
  const scope = node.entry.definition.deliversLazily ? childScope(scoped.signal) : undefined
  const attempted = scope === undefined ? scoped : { ...scoped, signal: scope.signal }
  try {
    return await attemptScoped(node, attempted, scope)
  } catch (error) {
    // Neither an engine bug nor a cancellation is an expression failure:
    // both cut through the fallback process untouched, rather than being
    // served back to the caller as the author's placeholder
    if (isInternalError(error) || isCancellation(error)) throw error
    const failure = wrapFailure(error, node)
    const fallback = fallbackOf(node)
    if (fallback === undefined) throw failure
    try {
      return fallback.kind === 'constant'
        ? fallback.value
        : await evaluateNode(fallback.node, scoped)
    } catch (fallbackError) {
      if (isInternalError(fallbackError)) throw fallbackError
      const wrapped = wrapFailure(fallbackError, node)
      if (wrapped.cause === undefined) wrapped.cause = failure
      throw wrapped
    }
  }
}

/**
 * Settle the node's abort scope the moment the body settles, not when the
 * whole wrapper returns — a fallback evaluating afterwards must not be
 * caught by the abort that ended the attempt.
 */
const attemptScoped = async (
  node: OperatorNode,
  ctx: EvaluationContext,
  scope: { settle: () => void } | undefined
): Promise<unknown> => {
  try {
    return await attempt(node, ctx)
  } finally {
    scope?.settle()
  }
}

const attempt = async (node: OperatorNode, ctx: EvaluationContext): Promise<unknown> => {
  const { params, propagate } = await resolveParams(node, ctx)
  if (propagate) return null
  const { definition } = node.entry
  const result = await definition.evaluate(params, createOperatorContext(ctx, definition))
  return normalizeResult(result, node)
}

type Fallback = { kind: 'node'; node: CompiledNode } | { kind: 'constant'; value: unknown }

/** The node's own fallback, else the operator's instance-wide default. */
const fallbackOf = (node: OperatorNode): Fallback | undefined => {
  if (node.fallback !== undefined) return { kind: 'node', node: node.fallback }
  const defaults = node.entry.instanceDefaults
  if (defaults !== undefined && Object.hasOwn(defaults, 'fallback'))
    return { kind: 'constant', value: defaults.fallback }
  return undefined
}

/**
 * The result boundary: `undefined` → `null`; the finite-number guard on a
 * number result; the escaped-handle guard. Top-level only — deep-walking a
 * result would break the O(holes) model.
 */
const normalizeResult = (result: unknown, node: OperatorNode): unknown => {
  if (result === undefined) return null
  if (typeof result === 'number' && !Number.isFinite(result))
    throw new FigTreeError({
      code: ErrorCodes.nonFiniteResult,
      message: `${node.name} – produced a non-finite number (${String(result)})`,
      path: node.path,
      operator: node.name,
    })
  if (isEngineHandle(result))
    throw new FigTreeError({
      code: ErrorCodes.escapedHandle,
      message: `${node.name} – returned a lazy handle instead of evaluating it`,
      path: node.path,
      operator: node.name,
    })
  return result
}

/**
 * Every throw becomes a FigTreeError tagged with this node, except one a
 * child already tagged, which passes through untouched.
 */
const wrapFailure = (error: unknown, node: OperatorNode): FigTreeError => {
  if (isFigTreeError(error)) return error
  if (isOperatorFailure(error))
    return new FigTreeError({
      code: error.code ?? ErrorCodes.operatorFailure,
      message: `${node.name} – ${error.message}`,
      path: node.path,
      operator: node.name,
      ...(error.errorData !== undefined ? { errorData: error.errorData } : {}),
    })
  const message = error instanceof Error ? error.message : String(error)
  return new FigTreeError({
    code: ErrorCodes.operatorFailure,
    message: `${node.name} – ${message}`,
    path: node.path,
    operator: node.name,
  })
}
