/**
 * The compile artifact — internal types for the Phase-3 parser.
 *
 * The contract these types serve is the obligations checklist in
 * docs-dev/v3-specs/v3-artifact-obligations.md (chunk-3.1 deliverable):
 * the checklist, not these shapes, is binding. Nothing here is barrel
 * surface — tests import from src/parse directly (the registry precedent)
 * and later phases may reshape these types freely provided every checklist
 * obligation still holds.
 *
 * Obligation references below use the checklist's numbering (A1–A4, B1–B7,
 * C1–C7).
 */
import type { RegistryEntry } from '../registry'
import type { PathSegment } from '../primitives'
import type { Issue } from '../issues'

/** A location in the input as authored — object keys and array indices. */
export type NodePath = (string | number)[]

/**
 * Fields every compiled node carries.
 *
 * `path` is the node's as-authored location (obligation A2): the path
 * `FigTreeError` is tagged with, and the path issues report. `order` is the
 * node's preorder position in the parse walk — the sort key that lets the
 * grammar layer (3.2) and the metadata layer (3.3) emit issues independently
 * and still produce one deterministic tree-ordered stream (A3).
 */
interface CompiledBase {
  path: NodePath
  order: number
}

/**
 * A subtree classified constant (A4): no operator/fragment node, no
 * reference string. Holds `literal` payloads (constant by fiat, unwalked)
 * and opaque non-plain values. `value` is held by reference and never
 * mutated (C4) — evaluation returns it by identity.
 */
export interface ConstantNode extends CompiledBase {
  kind: 'constant'
  value: unknown
}

export type ReferenceNamespace = 'data' | 'vars' | 'params' | 'element' | 'index'

/**
 * A recognized reference string (References area). Namespace aliases are
 * normalized away at parse (A1) — `$d.x` compiles identically to `$data.x`.
 * `segments` is the drill path from the shared path grammar ([*] projection
 * included); empty for a bare namespace. `raw` keeps the authored spelling
 * for messages.
 *
 * `binding` is set on `element`/`index` references reached through an
 * iterator's `as` renaming (`as: 'order'` → `$order` / `$orderIndex`): the
 * as-name the reference resolves through. Recognition of renamed bindings
 * is scope-dependent, so it happens in the walk — `as` values are
 * structural (parse-time literals), which is what makes this static.
 */
export interface ReferenceNode extends CompiledBase {
  kind: 'reference'
  namespace: ReferenceNamespace
  segments: PathSegment[]
  raw: string
  binding?: string
}

/**
 * An operator node in canonical form (A1): canonical `name`, named
 * parameters only — shorthand faces, symbol aliases and positional payloads
 * are all normalized away here. `entry` bakes the registry resolution into
 * the artifact (C3), `instanceDefaults` included; each parameter's delivery
 * mode is bound through `entry.definition.parameters` (B3).
 */
export interface OperatorNode extends CompiledBase {
  kind: 'operator'
  name: string
  entry: RegistryEntry
  params: Record<string, CompiledNode>
  /** Compiled lazily-evaluated failure catch; absent when not authored. */
  fallback?: CompiledNode
  /** Authored literal boolean only (grammar rule); absent when unauthored. */
  useCache?: boolean
  /** The node's vars block: static names → compiled expressions. */
  vars?: Record<string, CompiledNode>
  /**
   * Operator-owned parse-time precompute slot (B5, B7): compiled literal
   * regex patterns (Phase 7.2), result-key skeletons (Phase 9). Opaque to
   * the parser.
   */
  precomputed?: unknown
}

/**
 * A fragment call in canonical form. The arguments mode is decided
 * statically (Fragments area): a plain-object `parameters` is the static
 * named-arguments map, a node-valued `parameters` is the dynamic mode, an
 * absent `parameters` is a zero-argument static call.
 */
export interface FragmentCallNode extends CompiledBase {
  kind: 'fragmentCall'
  name: string
  argumentsMode: 'static' | 'dynamic'
  parameters?: Record<string, CompiledNode> | CompiledNode
  fallback?: CompiledNode
  vars?: Record<string, CompiledNode>
}

/**
 * A plain object/array literal containing evaluable descendants (B1): the
 * constant shape (the `skeleton`) plus its holes. Named for that shape, and
 * unrelated to `buildString.template` — an ordinary string parameter, which
 * is the collision the name `TemplateNode` used to carry. A literal with
 * zero holes compiles to a ConstantNode instead — the identity
 * short-circuit unit. `//` keys and consumed plain-literal `vars` blocks
 * are already stripped from the skeleton (C6).
 */
export interface SkeletonNode extends CompiledBase {
  kind: 'skeleton'
  skeleton: unknown
  holes: SkeletonHole[]
  /** A plain-literal vars block scoping this subtree (consumed — C6). */
  vars?: Record<string, CompiledNode>
}

/**
 * A hole inside a skeleton node. `path` is absolute from the input root
 * (the as-authored path, A2 — what errors are tagged with); `at` is the
 * splice position relative to the skeleton's own value. They usually agree
 * modulo the skeleton's prefix, but diverge for synthetic containers (a
 * rest-slice positional payload), so both are stored.
 */
export interface SkeletonHole {
  path: NodePath
  at: NodePath
  node: CompiledNode
}

/**
 * An element-addressable parameter value: the compiled nodes of a literal
 * array supplied to a `lazyElements` or `race` parameter, kept whole
 * rather than flattened into a skeleton. Those modes hand the body one
 * individually-demandable handle per element, which a skeleton's maximal
 * holes cannot express — a partly-constant element dissolves into the
 * enclosing shape and stops being a node at all.
 *
 * Only ever a parameter value: never a root, never a container child, and
 * never dispatched by `evaluateNode` (resolveParams consumes it). Built
 * only when at least one element is non-constant — an all-constant literal
 * stays a ConstantNode and reaches the body through the degeneration rule,
 * which is what keeps literal arrays visible to `validate` hooks (they see
 * constant parameters only).
 *
 * An element's index is its position in `nodes`, which is
 * parameter-relative. It is not derivable from the element's `path`: a
 * positional payload that bound leading parameters before the rest slice
 * shifts every authored index, and the body's index-ordered obligations
 * (race's lowest-index failure rule) are about the parameter.
 */
export interface ElementsNode extends CompiledBase {
  kind: 'elements'
  nodes: CompiledNode[]
}

/**
 * An entry-addressable parameter value: the compiled values of a literal
 * object supplied to a `lazyEntries` parameter — static data keys mapping
 * to individually-demandable expressions. The shape `match`'s branch map
 * needs, and the same shape a `vars` block compiles to.
 *
 * The same placement and construction rules as ElementsNode.
 */
export interface EntriesNode extends CompiledBase {
  kind: 'entries'
  entries: Record<string, CompiledNode>
  /** A vars block on the map, consumed as on any plain object literal. */
  vars?: Record<string, CompiledNode>
}

/**
 * A subtree whose grammar failed (malformed node, unknown operator) — the
 * error-severity issue is already in the stream; this placeholder keeps the
 * artifact well-formed. Classified evaluable, never constant: a malformed
 * node engaged the grammar — it is a broken expression, not inert data
 * (the `isEvaluable` ruling in v3-evaluator-methods.md).
 */
export interface InvalidNode extends CompiledBase {
  kind: 'invalid'
  raw: unknown
}

export type CompiledNode =
  | ConstantNode
  | ReferenceNode
  | OperatorNode
  | FragmentCallNode
  | SkeletonNode
  | ElementsNode
  | EntriesNode
  | InvalidNode

/**
 * A top-level hole: a maximal evaluable node (A2). `staticFallback` is the
 * shielding precompute (B2) — present iff the hole root's fallback subtree
 * (or its operator's `instanceDefaults.fallback`) is classified constant;
 * the wrapper object distinguishes an absent fallback from a constant
 * `null` one.
 */
export interface ArtifactHole {
  path: NodePath
  node: CompiledNode
  staticFallback?: { value: unknown }
}

/** The dependency record (B6) — the `getDependencies()` data, minus sorting. */
export interface ArtifactDependencies {
  /** Statically-known $data paths, as-written spellings, deduplicated. */
  dataPaths: string[]
  /**
   * True when the read-set is not statically enumerable: a dynamic `get`
   * path, a bare `$data`, or a dynamic-arguments fragment call.
   */
  dynamic: boolean
  /** Canonical operator names invoked. */
  operators: string[]
  /** Fragment names called. */
  fragments: string[]
}

/**
 * An issue tagged with its emitting node's preorder position — the working
 * shape both check layers emit. The finalized artifact stream is sorted by
 * `order` (then emission sequence, for multiple issues on one node) and the
 * tag stays internal: `validate()` returns plain `Issue`s.
 */
export interface SequencedIssue {
  issue: Issue
  order: number
}

/**
 * The compile artifact — the four products of the parse pass (A1–A4) plus
 * the precomputations (B). Option-independent (C1) and data-independent
 * (C2) by construction: nothing here may derive from any option outside
 * the registry-affecting three, and nothing from `data`.
 */
export interface ParseArtifact {
  root: CompiledNode
  /** Maximal evaluable nodes; empty for a fully-constant input. */
  holes: ArtifactHole[]
  /**
   * The option-independent static issue stream, tree-ordered (A3). The two
   * option-dependent checks (maxDepth/maxNodes, sample-data) run per call
   * against `nodeCount`/`maxDepth`/`dependencies` and are never stored.
   */
  issues: SequencedIssue[]
  /** True iff every hole carries a static fallback (B2). */
  shielded: boolean
  /**
   * The number of evaluable nodes — operator, fragment-call, reference and
   * invalid placeholders (B4, amended September 2026). Constants and plain
   * containers are structure, not work, and are not counted; `literal`
   * contents are never walked. What `maxNodes` compares against.
   */
  nodeCount: number
  /**
   * Measured nesting of the walked input, containers included, capped by
   * the walk's built-in ceiling (src/parse/probe.ts). What `maxDepth`
   * compares against.
   */
  maxDepth: number
  dependencies: ArtifactDependencies
  /**
   * True when the input contains opaque constants — such artifacts must
   * never be served from the content-keyed cache layer (C5). The key
   * serializer refuses them too, and is the stronger of the two guards:
   * a `literal` payload is never walked, so an opaque value inside one
   * leaves this flag `false`.
   */
  identityOnly: boolean
}

/**
 * The `as` name this iterator binds under, or null for the default
 * `$element` / `$index` pair. The one definition of the convention the
 * contract's scoping generalization describes — a structural parameter
 * literally named `as` — read identically by the static checker and by the
 * runtime that builds the binding frames.
 */
export const renamedBinding = (node: OperatorNode): string | null => {
  const declared = node.entry.definition.parameters.as
  if (declared?.evaluation !== 'structural') return null
  const supplied = node.params.as
  if (supplied?.kind === 'constant' && typeof supplied.value === 'string') return supplied.value
  return null
}

/**
 * Whether an iterator frame binding `as` (null for the default pair)
 * answers a reference written under `binding`: undefined for a bare
 * `$element` / `$index`, else the `as` name or its `Index` counterpart.
 * A renamed frame does NOT bind the default names — one way to refer to
 * each thing. The static checker and the runtime both resolve through
 * this one predicate, which is what makes the static `unresolved-binding`
 * error true of the runtime.
 */
export const bindsReference = (
  as: string | null,
  namespace: 'element' | 'index',
  binding: string | undefined
): boolean =>
  binding === undefined
    ? as === null
    : (namespace === 'element' ? as : `${as ?? ''}Index`) === binding
