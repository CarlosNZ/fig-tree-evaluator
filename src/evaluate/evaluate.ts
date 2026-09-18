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
import type { CompiledNode, SkeletonHole, SkeletonNode } from '../parse'
import type { EvaluationContext } from './context'
import { internalError } from './internal'
import { evaluateOperator } from './operator'
import { resolveReference } from './reference'
import { pushVars } from './scope'

export const evaluateNode = async (
  node: CompiledNode,
  ctx: EvaluationContext
): Promise<unknown> => {
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
      throw internalError(
        `fragment call '${node.name}' reached evaluation — fragments land in Phase 11`
      )
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

type Container = Record<string | number, unknown>

/**
 * Splice hole results into the skeleton, copying only the containers on
 * each splice path (once per evaluation). Constant subtrees off those paths
 * stay shared with the artifact and the input — the documented
 * results-are-read-only contract.
 */
const splice = (skeleton: unknown, holes: SkeletonHole[], values: unknown[]): unknown => {
  const copied = new Set<object>()
  let result = skeleton
  holes.forEach((hole, i) => {
    result = setAt(result, hole.at, values[i], copied)
  })
  return result
}

const setAt = (
  container: unknown,
  at: (string | number)[],
  value: unknown,
  copied: Set<object>
): unknown => {
  const copy = copyOnce(container as Container, copied)
  const [key, ...rest] = at
  copy[key] = rest.length === 0 ? value : setAt(copy[key], rest, value, copied)
  return copy
}

const copyOnce = (container: Container, copied: Set<object>): Container => {
  if (copied.has(container)) return container
  const copy: Container = Array.isArray(container)
    ? ([...container] as unknown as Container)
    : { ...container }
  copied.add(copy)
  return copy
}
