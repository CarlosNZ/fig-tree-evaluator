/**
 * The compiled tree as the report prints it — `canonicalForm` ("canonicalForm"
 * in docs-dev/v3-specs/v3-inspect.md): one object per compiled node, with
 * the artifact's kinds, nesting and facts.
 *
 * Every node is rebuilt rather than copied, for three reasons. An artifact
 * node is not JSON: `entry` holds the registry entry and its functions, a
 * reference's segments can hold the `WILDCARD` symbol, and authored values
 * need converting. It is shared: the compile cache hands the artifact to
 * every holder, so nothing in the report may be one of its objects. And the
 * report's shape names a few fields its own way and derives others — a
 * rendered `reference` beside its `authored` spelling, `operator`, `shape`
 * and `elements` for the artifact's `name`, `skeleton` and `nodes`, and
 * `resolved`, `instanceDefaults` and `timeoutFallback` from what is dropped
 * — which is why each kind is built by its own case.
 */
import { renderReference, splice, type CompileArtifact, type CompiledNode } from '../compile'
import { toJson, type Json, type Path } from './values'

/** What a skeleton's reserved slots print as (see `holes[].at`). */
const HOLE = '<hole>'

/**
 * A type alias only: the shape of the four fields that map names to nodes —
 * `params`, `vars`, `entries` and a static call's `parameters`.
 */
type NodeMap = Record<string, InspectNode>

/**
 * One compiled node. `order` is the node's position in the compile walk's
 * preorder — the number its issues carry — and `path` its location in the
 * source as authored.
 */
export type InspectNode = { order: number; path: Path } & (
  | { kind: 'constant'; value: Json }
  | { kind: 'reference'; reference: string; authored: string; binding?: string }
  | {
      kind: 'operator'
      vars?: NodeMap
      operator: string
      params: NodeMap
      fallback?: InspectNode
      /** The constant a top-level hole's timeout assembly splices in. */
      timeoutFallback?: Json
      useCache?: boolean
      instanceDefaults?: string[]
    }
  | {
      kind: 'fragmentCall'
      vars?: NodeMap
      fragment: string
      resolved: boolean
      argumentsMode: 'static' | 'dynamic'
      parameters?: NodeMap | InspectNode
      fallback?: InspectNode
      timeoutFallback?: Json
    }
  | {
      kind: 'skeleton'
      vars?: NodeMap
      shape: Json
      holes: { at: Path; node: InspectNode }[]
    }
  | { kind: 'elements'; elements: InspectNode[] }
  | { kind: 'entries'; vars?: NodeMap; entries: NodeMap }
  | { kind: 'invalid'; raw: Json }
)

/**
 * Render the artifact's root. A `timeoutFallback` is the artifact's per-hole
 * shielding precompute, so it rides only the top-level holes' nodes — the
 * one place a timeout can splice a constant without running anything.
 */
export const renderTree = (artifact: CompileArtifact): InspectNode => {
  const fallbacks = new Map<CompiledNode, { value: unknown }>()
  for (const hole of artifact.holes)
    if (hole.timeoutFallback !== undefined) fallbacks.set(hole.node, hole.timeoutFallback)

  const renderAll = (nodes: Record<string, CompiledNode>): NodeMap =>
    Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, render(node)]))

  // The key's presence is the fact: a constant `null` fallback reads as
  // `timeoutFallback: null`, where a hole with none has no key
  const shielding = (node: CompiledNode) => {
    const fallback = fallbacks.get(node)
    return fallback === undefined ? {} : { timeoutFallback: toJson(fallback.value) }
  }

  const render = (node: CompiledNode): InspectNode => {
    const base = { order: node.order, kind: node.kind, path: [...node.path] }
    // Compiled first and in scope for everything below it, so it leads
    const vars = 'vars' in node && node.vars !== undefined ? { vars: renderAll(node.vars) } : {}
    switch (node.kind) {
      case 'constant':
        return { ...base, kind: node.kind, value: toJson(node.value) }
      case 'reference':
        return {
          ...base,
          kind: node.kind,
          // The canonical spelling: normalized namespace, bound name, `[*]`
          reference: renderReference(node.binding ?? node.namespace, node.segments),
          authored: node.raw,
          ...(node.binding === undefined ? {} : { binding: node.binding }),
        }
      case 'operator':
        return {
          ...base,
          kind: node.kind,
          ...vars,
          operator: node.name,
          params: renderAll(node.params),
          ...(node.fallback === undefined ? {} : { fallback: render(node.fallback) }),
          ...shielding(node),
          ...(node.useCache === undefined ? {} : { useCache: node.useCache }),
          ...(node.entry.instanceDefaults === undefined
            ? {}
            : { instanceDefaults: Object.keys(node.entry.instanceDefaults) }),
        }
      case 'fragmentCall':
        return {
          ...base,
          kind: node.kind,
          ...vars,
          fragment: node.name,
          resolved: node.entry !== undefined,
          argumentsMode: node.argumentsMode,
          ...(node.parameters === undefined
            ? {}
            : {
                parameters:
                  node.argumentsMode === 'dynamic'
                    ? render(node.parameters as CompiledNode)
                    : renderAll(node.parameters as Record<string, CompiledNode>),
              }),
          ...(node.fallback === undefined ? {} : { fallback: render(node.fallback) }),
          ...shielding(node),
        }
      case 'skeleton': {
        // Filled by the engine's own `splice`, a placeholder standing in for
        // each hole's value: the shape is assembled exactly as evaluation
        // assembles a result, hole keys landing after the constant ones
        const filled = splice(
          node.skeleton,
          node.holes,
          node.holes.map(() => HOLE)
        )
        return {
          ...base,
          kind: node.kind,
          ...vars,
          shape: toJson(filled),
          holes: node.holes.map((hole) => ({ at: [...hole.at], node: render(hole.node) })),
        }
      }
      case 'elements':
        return { ...base, kind: node.kind, elements: node.nodes.map(render) }
      case 'entries':
        return { ...base, kind: node.kind, ...vars, entries: renderAll(node.entries) }
      case 'invalid':
        return { ...base, kind: node.kind, raw: toJson(node.raw) }
    }
  }

  return render(artifact.root)
}
