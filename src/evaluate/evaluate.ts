/**
 * The recursive evaluator core — the four-kind dispatch over the compile
 * artifact ("One spine, three views" in
 * docs-dev/v3-specs/v3-evaluator-methods.md; "Parse → compile → evaluate"
 * in docs-dev/v3-specs/v3-implementation-notes.md). A constant is returned
 * by identity, a reference is resolved, a skeleton evaluates its holes
 * concurrently and splices them into a copy-on-write copy of its constant
 * shape, an operator node goes through the node wrapper. Fragment calls,
 * invalid placeholders and the scoped namespaces are unreachable here until
 * their phases: the static gate refuses every error-severity issue before
 * evaluation starts.
 */
import { splice, type CompiledNode, type SkeletonNode } from '../parse'
import type { EvaluationContext } from './context'
import { abortedOutcome, internalError } from './internal'
import { evaluateFragment } from './fragment'
import { evaluateOperator } from './operator'
import { resolveReference } from './reference'
import { pushVars } from './scope'

export const evaluateNode = async (
  node: CompiledNode,
  ctx: EvaluationContext
): Promise<unknown> => {
  // The node boundary is where cancellation lands: no new work starts once
  // the enclosing scope is gone. The kill switch — the caller's signal or
  // the evaluation deadline — surfaces as an error that cuts through
  // fallbacks; a scope abort means a sibling already decided the answer,
  // so this branch is simply abandoned and raises nothing anyone will see
  if (ctx.signal.aborted) throw abortedOutcome(ctx, node.path)
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
}

const evaluateSkeleton = async (node: SkeletonNode, ctx: EvaluationContext): Promise<unknown> => {
  // `vars` is functional and consumed on a plain object literal, scoping
  // the whole subtree — and the parser has already stripped the key, so
  // the scope is all that is left to apply
  const scoped = pushVars(ctx, node.vars)
  const values = await Promise.all(node.holes.map((hole) => evaluateNode(hole.node, scoped)))
  return splice(node.skeleton, node.holes, values)
}

