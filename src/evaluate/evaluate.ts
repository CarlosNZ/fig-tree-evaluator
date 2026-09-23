/**
 * The recursive evaluator core — the four-kind dispatch over the compile
 * artifact ("One spine, three views" in
 * docs-dev/v3-specs/v3-evaluator-methods.md; "Compile → evaluate"
 * in docs-dev/v3-specs/v3-implementation-notes.md). A constant is returned
 * by identity, a reference is resolved, a skeleton evaluates its holes
 * concurrently and splices them into a copy-on-write copy of its constant
 * shape, an operator node goes through the node wrapper. Fragment calls,
 * invalid placeholders and the scoped namespaces are unreachable here until
 * their phases: the static gate refuses every error-severity issue before
 * evaluation starts.
 */
import { splice, type CompiledNode, type SkeletonNode } from '../compile'
import type { EvaluationContext } from './context'
import { isFigTreeError } from '../FigTreeError'
import { abortedOutcome, internalError, isCancellation } from './internal'
import { now, type TraceAnnotation, type TraceRecorder } from './trace'
import { evaluateFragment } from './fragment'
import { evaluateOperator } from './operator'
import { resolveReference } from './reference'
import { pushVars } from './scope'
import { isThenable, type MaybePromise } from '../utils'

export const evaluateNode = (
  node: CompiledNode,
  ctx: EvaluationContext,
  annotation?: TraceAnnotation
): MaybePromise<unknown> => {
  // The recorder's absence is the fast path, and it is the only cost
  // trace imposes on an untraced evaluation
  if (ctx.trace !== undefined) return traced(node, ctx, ctx.trace, annotation)
  // The node boundary is where cancellation lands: no new work starts once
  // the enclosing scope is gone. The kill switch — the caller's signal or
  // the evaluation deadline — surfaces as an error that cuts through
  // fallbacks; a scope abort means a sibling already decided the answer,
  // so this branch is simply abandoned and raises nothing anyone will see
  if (ctx.abortScope.aborted) return Promise.reject(abortedOutcome(ctx, node.path))
  return dispatch(node, ctx)
}

/**
 * The same boundary, recording. The entry opens BEFORE the cancellation
 * check, so a node abandoned at its boundary is a `cancelled` entry
 * rather than an absence — an absence would be indistinguishable from a
 * subtree that was never demanded, which is the opposite fact.
 */
const traced = async (
  node: CompiledNode,
  ctx: EvaluationContext,
  recorder: TraceRecorder,
  annotation: TraceAnnotation | undefined
): Promise<unknown> => {
  const entry = recorder.enter(node, ctx.traceParent, ctx.frame, annotation)
  const started = now()
  try {
    if (ctx.abortScope.aborted) throw abortedOutcome(ctx, node.path)
    const value = await dispatch(node, { ...ctx, traceParent: entry })
    recorder.settle(entry, 'value', { value, elapsed: now() - started })
    return value
  } catch (error) {
    recorder.settle(entry, isCancellation(error) ? 'cancelled' : 'failed', {
      ...(isFigTreeError(error) ? { error } : {}),
      elapsed: now() - started,
    })
    throw error
  }
}

/**
 * The dispatch and the boundary above it are plain functions that hand
 * back the handler's own result, not async wrappers around it: an async
 * function returning a promise costs a second promise and the microtasks
 * to chain the two, per node, for nothing. A leaf that already has its
 * value — a constant, a `$data` read — hands the value back with no
 * promise at all; a `$vars` or `$params` read that must wait hands back
 * its promise. A leaf that fails synchronously (a strict data miss) is
 * converted to a rejection here, so no caller ever sees a throw where it
 * did not before: every failure still arrives as a promise settling, and
 * every sibling is still started before one is observed.
 */
const dispatch = (node: CompiledNode, ctx: EvaluationContext): MaybePromise<unknown> => {
  try {
    switch (node.kind) {
      case 'constant':
        return node.value
      case 'reference':
        return resolveReference(node, ctx)
      case 'skeleton':
        return evaluateSkeleton(node, ctx)
      case 'operator':
        return evaluateOperator(node, ctx)
      case 'fragmentCall':
        return evaluateFragment(node, ctx)
      case 'elements':
      case 'entries':
        throw internalError(
          `a '${node.kind}' parameter value reached the node dispatch — parameter resolution consumes these, and nothing else may hold one`
        )
      case 'invalid':
        throw internalError(
          'an invalid node reached evaluation — the static gate should have refused it'
        )
    }
  } catch (error) {
    return Promise.reject(error)
  }
}

const evaluateSkeleton = async (node: SkeletonNode, ctx: EvaluationContext): Promise<unknown> => {
  // The hole boundary belongs to the ARTIFACT root's holes alone, and this
  // is the first skeleton an evaluation reaches — so take it, and clear it
  // for everything below: a nested skeleton's holes sit inside a hole
  // already, where neither degradation nor shielded assembly is defined
  const boundary = ctx.rootBoundary
  const inner = boundary === undefined ? ctx : { ...ctx, rootBoundary: undefined }
  // `vars` is functional and consumed on a plain object literal, scoping
  // the whole subtree — and the compiler has already stripped the key, so
  // the scope is all that is left to apply
  const scoped = pushVars(inner, node.vars)
  const outcomes = node.holes.map((hole) =>
    boundary === undefined
      ? evaluateNode(hole.node, scoped)
      : boundary(() => evaluateNode(hole.node, scoped), hole.node)
  )
  // A skeleton whose holes all answered at once — data reads into a
  // config — needs no `Promise.all`
  const values = outcomes.some(isThenable) ? await Promise.all(outcomes) : outcomes
  return splice(node.skeleton, node.holes, values)
}
