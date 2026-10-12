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
 * error never comes with a dead-`noCache` warning on top of it. Where all
 * that could cache is operators the host turned off, the `noCache` repeats
 * the host's, and the warning calls it redundant and names them.
 */
import { ErrorCodes } from '../errorCodes'
import { operatorCaches } from '../registry'
import { listing } from '../utils'
import {
  childrenOf,
  extendPath,
  pushIssue,
  sortIssues,
  type CompileArtifact,
  type CompiledNode,
  type FragmentCallNode,
  type OperatorNode,
} from './artifact'

/**
 * What a subtree can reach. `capable`: some node in it could cache, its
 * own `noCache` nodes aside — what decides whether a `noCache` above it is
 * dead. `effective`: some node in it does cache, those `noCache` nodes
 * respected — what a fragment's `caches` rollup is. `disabled`: the
 * operators in it that declare `cache: true` but the host's `noCache`
 * turned off, by name — what a `noCache` above it repeats, where nothing
 * else could cache.
 */
interface Reach {
  capable: boolean
  effective: boolean
  disabled: string[]
}

const NOTHING: Reach = { capable: false, effective: false, disabled: [] }
const UNKNOWN: Reach = { capable: true, effective: true, disabled: [] }

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
    case 'elements':
    case 'entries':
      return all(artifact, childrenOf(node), shadowed)
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
  const turnedOff = disabledName(node)
  const disabled = turnedOff === undefined ? children.disabled : [turnedOff, ...children.disabled]
  if (own && shadowed)
    warn(artifact, node, "'noCache' is redundant — an enclosing node already sets it")
  else if (own && !capable)
    warn(
      artifact,
      node,
      disabled.length > 0
        ? `'noCache' is redundant — caching is already disabled for ${nameList(disabled)}`
        : "'noCache' is dead — nothing beneath this node caches"
    )
  return { capable, effective: !own && (self || children.effective), disabled }
}

/**
 * The operator's name, on an operator node whose definition caches but
 * the host turned off.
 */
const disabledName = (node: OperatorNode | FragmentCallNode) =>
  node.kind === 'operator' && node.entry.definition.cache && !operatorCaches(node.entry)
    ? node.entry.definition.name
    : undefined

/** `'http'`, `'http' and 'sql'`: each name once, in tree order. */
const nameList = (names: string[]) => listing([...new Set(names)].map((name) => `'${name}'`))

const all = (artifact: CompileArtifact, nodes: CompiledNode[], shadowed: boolean): Reach => {
  const reach: Reach = { capable: false, effective: false, disabled: [] }
  // Every child is visited, never short-circuited: each may carry a
  // `noCache` of its own to warn about
  for (const child of nodes) {
    const { capable, effective, disabled } = visit(artifact, child, shadowed)
    reach.capable ||= capable
    reach.effective ||= effective
    reach.disabled.push(...disabled)
  }
  return reach
}

const warn = (
  artifact: CompileArtifact,
  node: OperatorNode | FragmentCallNode,
  message: string
) => {
  pushIssue(
    artifact.issues,
    'warning',
    ErrorCodes.uselessModifier,
    message,
    extendPath(node.path, 'noCache'),
    node.order,
    node.kind === 'operator' ? { operator: node.name } : { fragment: node.name }
  )
}
