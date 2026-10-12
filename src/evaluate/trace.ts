/**
 * The trace recorder ("trace: true — the process" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * One rule shapes the whole module: **trace mirrors the instance tree**,
 * so the recorder hangs off the node boundary and records what happened
 * at each node INSTANCE — the static tree unrolled by iteration, by
 * fragment calls and by var evaluations. It lives in ./evaluate.ts's
 * dispatch rather than in the two node wrappers, because that is the one
 * place every kind passes through: operators, fragment calls, references,
 * constants and skeletons alike. Duplicating it across `evaluateOperator`
 * and `evaluateFragment` — deliberate siblings — would be a standing
 * drift hazard for no gain.
 *
 * Three things the shape has to do that a naive "append a child" cannot:
 *
 *   - **Structural order.** Parameters start concurrently and lazy ones
 *     are demanded late, so arrival order is exactly what must not
 *     survive. Children are held aside while an entry is open and
 *     materialized, sorted, when it settles — by the node's preorder
 *     position from the compile walk, then by element index for the
 *     instances that share one static node.
 *   - **`skipped`.** A subtree that was never demanded leaves no trace of
 *     itself by definition, so the absence has to be computed: on settle,
 *     every static child with no instance becomes a `skipped` leaf.
 *   - **Abandonment.** A hole cut off by a shielded deadline may never
 *     settle at all, so its entry would stay open forever. `finish()`
 *     closes every entry still open as `cancelled`, which is exactly what
 *     it means — for everything beneath the hole. The hole itself was
 *     answered by its static fallback, which the boundary records the
 *     moment the deadline wins; what the abandoned attempt does after
 *     that, settling late or being closed by `finish()`, does not
 *     overwrite it.
 *
 * Cost when off is nothing: there is no recorder on the context, `note`
 * is the no-op stub, and the dispatch takes its existing fast path.
 */
import type { Issue } from '../issues'
import type { FigTreeError } from '../FigTreeError'
import { childrenOf, toNodePath, type CompiledNode } from '../compile'
import type { TraceEvent } from '../runtimeInterface'
import type { TraceKind, TraceNode, TraceStatus } from '../trace'
import type { FragmentFrame } from './context'

/** Where an entry sits among its siblings, before they are ordered. */
interface Placed {
  entry: TraceNode
  /** The node's preorder position in the compile walk. */
  order: number
  /** Element index, for instances sharing one static node. */
  index: number
}

/** Bookkeeping for an entry that has not settled yet. */
interface Open {
  node: CompiledNode
  children: Placed[]
  /** Static children that produced an instance — the rest are skipped. */
  seen: Set<CompiledNode>
  /** When the entry opened — the `elapsed` of a hole the deadline cut off. */
  started: number
}

/** What the dispatch knows about an instance that the node does not. */
export interface TraceAnnotation {
  /** The var this entry's definition belongs to. */
  var?: string
  /** The element index, where one static node has many instances. */
  index?: number
}

export interface TraceRecorder {
  /** Open an entry for one node instance, beneath `parent`. */
  enter: (
    node: CompiledNode,
    parent: TraceNode | undefined,
    frame: FragmentFrame | undefined,
    annotation: TraceAnnotation | undefined
  ) => TraceNode
  /** Close an entry with what became of it. */
  settle: (entry: TraceNode, status: TraceStatus, detail: SettleDetail) => void
  /** Mark an entry as having been answered by its `fallback`. */
  markFallback: (entry: TraceNode, caught: FigTreeError) => void
  /** Append an event to an entry. */
  note: (entry: TraceNode, event: TraceEvent) => void
  /**
   * Mark the most recent instance of a shielded hole as answered by its
   * static fallback, the deadline having cut it off.
   */
  markShielded: (node: CompiledNode, caught: FigTreeError, value: unknown) => void
  /** Close everything still open as `cancelled`, and return the root. */
  finish: () => TraceNode | undefined
}

export interface SettleDetail {
  value?: unknown
  error?: FigTreeError
  elapsed?: number
}

/** Wall clock for `elapsed`, in whole-ish milliseconds. */
export const now = (): number => performance.now()

export const createTraceRecorder = (warnings: Issue[]): TraceRecorder => {
  const open = new Map<TraceNode, Open>()
  /** The most recent instance of each static node — see `markShielded`. */
  const latest = new WeakMap<CompiledNode, TraceNode>()
  /** Entries whose outcome the hole boundary decided — see `close`. */
  const decided = new WeakSet<TraceNode>()
  let root: TraceNode | undefined

  const place = (parent: TraceNode | undefined, placed: Placed, node: CompiledNode) => {
    if (parent === undefined) {
      root = placed.entry
      return
    }
    const holder = open.get(parent)
    if (holder === undefined) return
    holder.children.push(placed)
    holder.seen.add(node)
  }

  const close = (entry: TraceNode, status: TraceStatus, detail: SettleDetail) => {
    const holder = open.get(entry)
    if (holder === undefined) return
    open.delete(entry)
    // A hole the shielded deadline cut off was answered by its static
    // fallback, which is what the result holds; the abandoned attempt
    // settling late, or not at all, changes nothing about that
    if (!decided.has(entry)) {
      // A fallback that answered has already said so; the dispatch only
      // ever sees the value it produced
      if (entry.status !== 'fallback') entry.status = status
      if (detail.error !== undefined && entry.error === undefined) entry.error = detail.error
      if (status !== 'failed' && status !== 'cancelled') entry.value = detail.value
      if (detail.elapsed !== undefined) entry.elapsed = detail.elapsed
    }
    const children = [...holder.children, ...skippedChildren(holder)]
    if (children.length > 0)
      entry.children = children
        .sort((a, b) => a.order - b.order || a.index - b.index)
        .map((child) => child.entry)
  }

  const append = (entry: TraceNode, event: TraceEvent) => {
    ;(entry.events ??= []).push(event)
  }

  const begin = (
    node: CompiledNode,
    parent: TraceNode | undefined,
    source: TraceNode['source'],
    annotation: TraceAnnotation | undefined
  ): TraceNode => {
    const operator = nameOf(node)
    const ref = refOf(node)
    const entry: TraceNode = {
      path: toNodePath(node.path),
      kind: kindOf(node),
      status: 'value',
      ...(source !== undefined ? { source } : {}),
      ...(operator !== undefined ? { operator } : {}),
      ...(ref !== undefined ? { ref } : {}),
      ...(annotation?.var !== undefined ? { var: annotation.var } : {}),
    }
    open.set(entry, { node, children: [], seen: new Set(), started: now() })
    latest.set(node, entry)
    place(parent, { entry, order: node.order, index: annotation?.index ?? 0 }, node)
    return entry
  }

  return {
    enter: (node, parent, frame, annotation) =>
      begin(
        node,
        parent,
        frame !== undefined ? { fragment: frame.fragment } : undefined,
        annotation
      ),
    settle: close,
    markFallback: (entry, caught) => {
      entry.status = 'fallback'
      entry.error = caught
    },
    note: append,
    markShielded: (node, caught, value) => {
      const entry = latest.get(node)
      const holder = entry === undefined ? undefined : open.get(entry)
      // A hole that already settled won its race, and was not cut off
      if (entry === undefined || holder === undefined) return
      decided.add(entry)
      entry.status = 'fallback'
      entry.error = caught
      entry.value = value
      entry.elapsed = now() - holder.started
      append(entry, { type: 'shielded-fallback' })
      // Where the static fallback is the node's own `fallback` key, that
      // child is what answered, so it is a `value` entry rather than a
      // `skipped` one. A fallback from `operatorDefaults` or lifted from a
      // fragment body has no node here to mark
      const own = ownFallbackOf(node)
      if (own !== undefined) close(begin(own, entry, entry.source, undefined), 'value', { value })
    },
    finish: () => {
      // Anything still open was abandoned rather than finished — a hole
      // the deadline cut off, or a race operand nobody waited for.
      // Innermost first, so a parent materializes its children after they
      // have materialized theirs
      for (const entry of [...open.keys()].reverse()) close(entry, 'cancelled', {})
      if (root !== undefined && warnings.length > 0) root.warnings = warnings
      return root
    },
  }
}

/** A `skipped` leaf for every static child that never produced an instance. */
const skippedChildren = (holder: Open): Placed[] =>
  staticChildren(holder.node)
    .filter((child) => !holder.seen.has(child))
    .map((child) => ({
      entry: { path: toNodePath(child.path), kind: kindOf(child), status: 'skipped' as const },
      order: child.order,
      index: 0,
    }))

/**
 * The children a node has in the compiled tree, whether or not they were
 * demanded — the denominator `skipped` is computed against.
 *
 * Container parameters are flattened rather than counted as one child:
 * an `elements` or `entries` node is consumed by parameter resolution and
 * never reaches the dispatch, so its members' instances, and its vars',
 * attach directly to the operator, and their absences must line up with
 * that.
 */
const staticChildren = (node: CompiledNode): CompiledNode[] => {
  const children = childrenOf(node).flatMap(flatten)
  // The body is reached through the call, so it is a child like any
  // other — and a call that never ran its body is worth seeing
  if (node.kind === 'fragmentCall' && node.entry !== undefined) children.push(node.entry.body)
  return children
}

const flatten = (node: CompiledNode): CompiledNode[] =>
  node.kind === 'elements' || node.kind === 'entries' ? staticChildren(node) : [node]

const kindOf = (node: CompiledNode): TraceKind => {
  switch (node.kind) {
    case 'operator':
      return 'operator'
    case 'fragmentCall':
      return 'fragment'
    case 'reference':
      return 'reference'
    case 'skeleton':
      return 'skeleton'
    default:
      return 'literal'
  }
}

const ownFallbackOf = (node: CompiledNode): CompiledNode | undefined =>
  node.kind === 'operator' || node.kind === 'fragmentCall' ? node.fallback : undefined

const nameOf = (node: CompiledNode): string | undefined =>
  node.kind === 'operator' || node.kind === 'fragmentCall' ? node.name : undefined

const refOf = (node: CompiledNode): string | undefined =>
  node.kind === 'reference' ? node.raw : undefined
