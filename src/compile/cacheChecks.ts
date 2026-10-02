/**
 * The `noCache` checks ("`noCache` semantics" in docs-dev/v3-specs/v3-api.md):
 * two `validate()` warnings over a finished tree, and whether the tree can
 * reach a node that caches.
 *
 * A pass of its own rather than part of the walk or the static checks,
 * because a fragment call answers from its target's `caches` rollup, and a
 * body's targets are not folded until registration's last pass — the walk
 * and the static checks over a body both run before it. So registration
 * runs this once per body, in dependency order (src/fragments.ts), and an
 * expression runs it after its static checks, against a registry whose
 * fragments are all folded.
 *
 * Both warnings are exact. An operator node can cache when its definition
 * declares `cache: true` and the host has not set `noCache` for it
 * (`operatorCaches`), and a call when its body can or one of its arguments
 * can. A malformed node and an unknown fragment count as able to, so an
 * error never comes with a dead-`noCache` warning on top of it.
 */
import { ErrorCodes } from '../errorCodes'
import type { Issue } from '../issues'
import { operatorCaches } from '../registry'
import {
  extendPath,
  sortIssues,
  toNodePath,
  type CompileArtifact,
  type CompiledNode,
  type FragmentCallNode,
  type OperatorNode,
} from './artifact'

/**
 * What a subtree can reach. `capable`: some node in it could cache, its
 * own `noCache` nodes aside — what decides whether a `noCache` above it is
 * dead. `effective`: some node in it does cache, those `noCache` nodes
 * respected — what a fragment's `caches` rollup is.
 */
interface Reach {
  capable: boolean
  effective: boolean
}

const NOTHING: Reach = { capable: false, effective: false }
const UNKNOWN: Reach = { capable: true, effective: true }

/**
 * Append the two warnings to the artifact's stream, in tree order, and
 * return whether the tree can reach a node that caches.
 */
export const checkNoCache = (artifact: CompileArtifact): boolean => {
  const { effective } = visit(artifact, artifact.root, false)
  sortIssues(artifact.issues)
  return effective
}

const visit = (artifact: CompileArtifact, node: CompiledNode, shadowed: boolean): Reach => {
  switch (node.kind) {
    case 'constant':
    case 'reference':
      return NOTHING
    case 'invalid':
      return UNKNOWN
    case 'skeleton':
      return all(
        artifact,
        [...node.holes.map((hole) => hole.node), ...valuesOf(node.vars)],
        shadowed
      )
    case 'elements':
      return all(artifact, node.nodes, shadowed)
    case 'entries':
      return all(artifact, [...Object.values(node.entries), ...valuesOf(node.vars)], shadowed)
    case 'operator':
      return visitInvocation(artifact, node, operatorCaches(node.entry), shadowed)
    case 'fragmentCall':
      // An unknown fragment already raised its error
      return visitInvocation(artifact, node, node.entry?.caches ?? true, shadowed)
  }
  // Exhaustive by construction: a new node kind must say what it reaches,
  // or a `noCache` above one would be judged on part of its subtree
  return node satisfies never
}

/** An operator node or a call: the two kinds that carry `noCache`. */
const visitInvocation = (
  artifact: CompileArtifact,
  node: OperatorNode | FragmentCallNode,
  self: boolean,
  shadowed: boolean
): Reach => {
  const own = node.noCache === true
  const children = all(artifact, childrenOf(node), shadowed || own)
  const capable = self || children.capable
  if (own && shadowed)
    warn(artifact, node, "'noCache' is redundant — an enclosing node already sets it")
  else if (own && !capable)
    warn(artifact, node, "'noCache' is dead — nothing beneath this node caches")
  return { capable, effective: !own && (self || children.effective) }
}

const childrenOf = (node: OperatorNode | FragmentCallNode): CompiledNode[] => {
  const children: CompiledNode[] = []
  if (node.kind === 'operator') children.push(...Object.values(node.params))
  else if (node.parameters !== undefined)
    if (node.argumentsMode === 'dynamic') children.push(node.parameters as CompiledNode)
    else children.push(...Object.values(node.parameters as Record<string, CompiledNode>))
  if (node.fallback !== undefined) children.push(node.fallback)
  children.push(...valuesOf(node.vars))
  return children
}

const all = (artifact: CompileArtifact, nodes: CompiledNode[], shadowed: boolean): Reach => {
  const reach = { capable: false, effective: false }
  // Every child is visited, never short-circuited: each may carry a
  // `noCache` of its own to warn about
  for (const child of nodes) {
    const { capable, effective } = visit(artifact, child, shadowed)
    reach.capable ||= capable
    reach.effective ||= effective
  }
  return reach
}

const valuesOf = (vars: Record<string, CompiledNode> | undefined): CompiledNode[] =>
  vars === undefined ? [] : Object.values(vars)

const warn = (
  artifact: CompileArtifact,
  node: OperatorNode | FragmentCallNode,
  message: string
) => {
  const issue: Issue = {
    severity: 'warning',
    code: ErrorCodes.uselessModifier,
    message,
    path: toNodePath(extendPath(node.path, 'noCache')),
  }
  if (node.kind === 'operator') issue.operator = node.name
  else issue.fragment = node.name
  artifact.issues.push({ issue, order: node.order })
}
