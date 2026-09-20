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
import { OperatorFailure, isOperatorFailure } from '../OperatorFailure'
import type { FigTreeOptions } from '../options'
import type { OperatorNode } from '../parse'
import { isEngineHandle } from '../runtimeInterface'
import {
  childScope,
  createOperatorContext,
  requestDeadline,
  type EvaluationContext,
  type RequestDeadline,
} from './context'
import { evaluateNode } from './evaluate'
import { cancellation, isCancellation, isInternalError } from './internal'
import { autoKey, through } from './memo'
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
    // Neither an engine bug, a cancellation, nor the caller's kill switch
    // is an expression failure: all three cut through the fallback process
    // untouched, rather than being served back to the caller as the
    // author's placeholder. The kill switch is the caller's decision, not
    // the author's, so a `fallback` has no standing to answer it
    if (isInternalError(error) || isCancellation(error) || isKillSwitch(error)) throw error
    const failure = wrapFailure(error, node)
    const fallback = fallbackOf(node, scoped)
    if (fallback === undefined) throw failure
    try {
      return await fallback()
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

/**
 * Resolve, run, normalize — and, where the node is cacheable, memoize
 * exactly that unit.
 *
 * What sits outside the memo is as deliberate as what sits inside.
 * `resolveParams` must be outside, since the key is built from its output;
 * that also means a failure in a parameter subtree rejects before an entry
 * could exist. The `fallback` is outside because it lives a frame up, so a
 * placeholder is never written under the failing node's key. And
 * `normalizeResult` is INSIDE: the finite-number and escaped-handle guards
 * then throw within the unit, so their failures are not cached either, and
 * `undefined` has become `null` before the write — a cached value can
 * never be `undefined`.
 */
const attempt = async (node: OperatorNode, ctx: EvaluationContext): Promise<unknown> => {
  const { params, propagate } = await resolveParams(node, ctx)
  if (propagate) return null
  const { definition } = node.entry
  const useCache = effectiveUseCache(node, ctx.options)

  // The node's own `timeout` parameter, if it declared one and this node
  // supplied it. Composed here rather than in the body, because only the
  // wrapper can decide what a resulting throw MEANS, and only the wrapper
  // can race a driver that will not honour a signal
  const ms = declaredTimeout(definition, params)
  const deadline = ms === undefined ? undefined : requestDeadline(ctx.signal, ms)
  const bodyCtx = deadline === undefined ? ctx : { ...ctx, signal: deadline.signal }
  const context = createOperatorContext(bodyCtx, { operator: definition.name, useCache })

  const run = async () => {
    // A signal can abort between the node-boundary check and here, while
    // this node's parameters resolve — and `addEventListener('abort')` on
    // an already-aborted signal NEVER fires, so a body that only listens
    // would run to completion and hand back a result nobody wants
    const landed = abortedOutcome(node, ctx)
    if (landed !== undefined) throw landed
    const running = Promise.resolve(definition.evaluate(params, context))
    if (deadline === undefined) return normalizeResult(await running, node)
    // The body may reject a tick AFTER the deadline won the race, when its
    // client notices the abort — without this that is an unhandled rejection
    running.catch(() => {})
    return normalizeResult(await Promise.race([running, deadline.expiry]), node)
  }

  const cached = async () => {
    if (!useCache || definition.cache !== 'auto') return run()
    const key = autoKey(node, params)
    // An unkeyable node runs uncached rather than sharing a weaker key
    return key === undefined ? run() : through(ctx.cache, key, run)
  }

  try {
    return await cached()
  } catch (error) {
    throw classifyBodyFailure(error, node, ctx, deadline, ms)
  } finally {
    deadline?.settle()
  }
}

/**
 * The outcome where an abort has ALREADY landed, or `undefined` where
 * none has. One helper, because two places need the same answer: before a
 * body starts, and after one throws.
 *
 * The order is the contract's: the caller's kill switch outranks an
 * enclosing scope, because they mean opposite things — a scope abort is
 * silent abandonment, a caller's abort is a decision that cuts through
 * every fallback.
 */
const abortedOutcome = (node: OperatorNode, ctx: EvaluationContext): unknown | undefined => {
  if (ctx.rootSignal.aborted)
    return new FigTreeError({
      code: ErrorCodes.aborted,
      message: 'evaluation was aborted by the caller',
      path: node.path,
      operator: node.name,
    })
  // `ctx.signal` is the deadline's PARENT, never the deadline itself, so
  // "someone upstream aborted me" stays distinguishable from "my own timer
  // fired". This runs before the enclosing scope settles, so it is not a
  // false positive on every lazily-delivering node
  if (ctx.signal.aborted) return cancellation()
  return undefined
}

/** The node's own deadline in ms, or `undefined` where it declared none. */
const declaredTimeout = (
  definition: OperatorNode['entry']['definition'],
  params: Record<string, unknown>
): number | undefined => {
  const name = definition.timeoutParam
  if (name === null) return undefined
  const ms = params[name]
  return typeof ms === 'number' && ms > 0 ? ms : undefined
}

/**
 * What a rejection from a body holding the signal actually MEANS. Three
 * outcomes that must never be confused, in priority order:
 *
 *   - the caller's kill switch, which cuts through every fallback because
 *     it is the caller's decision rather than the author's;
 *   - an enclosing scope's abort — silent cancellation: a sibling already
 *     decided the answer and nobody is waiting, so no fallback runs;
 *   - this node's own deadline, an ORDINARY failure the node's `fallback`
 *     catches, which is the per-node network-flakiness guard.
 *
 * Until Phase 9 no core operator held the signal, so a client's
 * `AbortError` had no way to reach a fallback and nothing exercised this.
 * It does now: without the classification, an abandoned request would come
 * back to the caller dressed as the author's placeholder.
 */
const classifyBodyFailure = (
  error: unknown,
  node: OperatorNode,
  ctx: EvaluationContext,
  deadline: RequestDeadline | undefined,
  ms: number | undefined
): unknown => {
  if (isInternalError(error) || isCancellation(error)) return error
  const landed = abortedOutcome(node, ctx)
  if (landed !== undefined) return landed
  if (deadline?.expired() === true)
    return new OperatorFailure(`request exceeded its ${String(ms)}ms timeout`, {
      code: ErrorCodes.requestTimeout,
    })
  return error
}

/**
 * Effective `useCache`, the settled four-step chain ("Caching" in
 * docs-dev/v3-specs/v3-operator-contract.md): the node's own key, then
 * the operator's `operatorDefaults` modifier, then the blanket option,
 * then the definition's metadata default.
 *
 * Total by construction, so it never falls off the end: the authored key
 * reaches the node only as a literal boolean (the parser rejects anything
 * else), the modifier default is boolean-checked at registration, and
 * `defineOperator` normalizes the metadata default to a boolean. A
 * fragment call cannot carry the key at all, so the domain is operator
 * nodes alone.
 *
 * Consumed twice per cacheable node: once to pick the `'auto'` layer, and
 * once more inside the body's context, where it makes `context.cache.memo`
 * an identity passthrough for a node that is not caching.
 */
export const effectiveUseCache = (node: OperatorNode, options: FigTreeOptions): boolean =>
  node.useCache ??
  (node.entry.instanceDefaults?.useCache as boolean | undefined) ??
  options.useCache ??
  node.entry.definition.useCache

/** The caller's abort, which no fallback may answer. */
const isKillSwitch = (error: unknown): boolean =>
  isFigTreeError(error) && error.code === ErrorCodes.aborted

/** The node's own fallback, else the operator's instance-wide default. */
const fallbackOf = (node: OperatorNode, ctx: EvaluationContext): (() => unknown) | undefined => {
  const own = node.fallback
  if (own !== undefined) return () => evaluateNode(own, ctx)
  const defaults = node.entry.instanceDefaults
  if (defaults !== undefined && Object.hasOwn(defaults, 'fallback')) return () => defaults.fallback
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
