/**
 * Chunk 3.2 — the parse walk: one pass over the raw input implementing the
 * recognition grammar ("Node grammar & reserved keys", "Shorthand grammar",
 * "Reference grammar" in docs-dev/v3-specs/v3-api.md), normalization to
 * canonical form, constancy classification, skeleton + hole extraction, and
 * the artifact precomputes (docs-dev/v3-specs/v3-artifact-obligations.md).
 *
 * The parser never throws on expression content: every grammar violation
 * becomes an error-severity issue and the offending subtree compiles to an
 * `invalid` placeholder. The metadata-driven check layer (chunk 3.3,
 * staticChecks.ts) runs as a second pass over the compiled AST.
 *
 * Vocabulary, which the rest of this file assumes:
 *
 * - **artifact** — what `parseExpression` returns: everything derivable
 *   from the input alone (the compiled tree, its holes, the static issues,
 *   the precomputes). It depends on no `data` and on no option but the
 *   registry-affecting three, which is what makes it reusable across
 *   evaluations. Binding contract: v3-artifact-obligations.md.
 * - **compile** — turn one raw input value into one `CompiledNode`
 *   (constant, reference, operator, fragmentCall, skeleton, invalid).
 *   `{ operator: '+', values: [1, '$d.x'] }` becomes an operator node
 *   carrying the canonical name `plus`, its registry entry, and its
 *   parameters under their declared names. Recognition happens once, here,
 *   so evaluation reads facts instead of re-deriving them per visit.
 * - **hole** — an evaluable node with constant structure around it. The
 *   artifact records the outermost ones, so evaluating a large config
 *   costs its holes rather than its whole input. Holes are also what
 *   errors are tagged against, and what shielding is computed per.
 * - **container** — a plain array or object: structure, not an
 *   invocation. One with no evaluable descendant compiles to a single
 *   constant; one with holes compiles to a **skeleton** node — the constant
 *   shape plus the holes to splice into it. (Not to be confused with
 *   `buildString.template`, which is an ordinary string parameter.)
 * - **order** — a node's position in the walk, parents before children.
 *   The two check passes emit issues independently, and sorting by `order`
 *   returns them to the order a reader sees in the document.
 * - **shielding** — a hole whose `fallback` is constant can be filled
 *   without evaluating anything. When every hole has one the expression is
 *   `shielded`: a timeout becomes constant assembly, and the editor gets
 *   its `timeoutShielded` badge.
 *
 * One scope concern lives here rather than in the check layer: iterator
 * `as` renaming. Renamed bindings (`$order`, `$orderIndex`) are
 * author-named reference strings, so *recognition* — and with it constancy
 * classification — depends on the enclosing `as` frames. `as` values are
 * structural (parse-time literals), which is what keeps this static.
 *
 * The steps, in order — 1–12 run per value visited (the walk recurses),
 * 13–16 once it returns:
 *
 *  1. Number the node (see `order` above), count it, track the max depth.
 *  2. Nullish, numeric and boolean values compile straight to constants.
 *  3. Opaque values (Date, Map, class instance, function) become constants
 *     too, and flag the artifact `identityOnly` — they don't survive
 *     serialization, so the content-keyed cache layer must never serve it.
 *  4. Strings go through the reference token rule: plain text is a
 *     constant, a `$namespace` token a reference (aliases normalized away),
 *     an illegal namespace use an error.
 *  5. An unrecognized `$token` is matched against the enclosing `as`
 *     bindings before being warned about and passed through as data.
 *  6. A `$data` reference records its path in the dependency list — a bare
 *     `$data` instead flags that list as incomplete, since an expression
 *     handed the whole data object can read anything in it.
 *  7. Objects are classified by their keys: `operator`, `fragment`, one
 *     `$name` shorthand, or a plain literal. Ambiguous combinations (two
 *     invocations, canonical beside shorthand) are hard errors.
 *  8. An operator name resolves through the alias map — unknown names error
 *     with a nearest-name suggestion. `literal` is where parsing stops
 *     descending: its content is taken verbatim, never walked, classified
 *     or counted, however node-like it looks.
 *  9. Reserved modifiers compile first: `fallback`, `useCache` (a literal
 *     boolean only), `vars` (names legality-checked, values walked).
 * 10. Parameters are gathered — named keys checked against the definition,
 *     a shorthand payload disambiguated by JSON type into positional slots
 *     (leading, then the rest slice), named arguments, or one
 *     first-position value.
 * 11. They then walk in a fixed order: an iterator's `as` first (it renames
 *     the element bindings, and is a parse-time literal precisely so the
 *     walk can read it), ordinary parameters next, and the per-element
 *     subtrees last, under the binding it named — the scope concern above.
 * 12. A fragment call checks its name against the lookup and fixes its
 *     argument mode statically: a plain object is the named map, a node or
 *     reference the dynamic form.
 * 13. Containers assemble: `//` keys and `undefined` values drop out, a
 *     `vars` block is consumed, stray `$keys` warn as inert, constant
 *     children fold into the skeleton and evaluable ones become holes (a
 *     nested skeleton flattens in unless it carries its own vars). No
 *     holes at all collapses the container to one constant — the raw value
 *     by identity where nothing changed.
 * 14. The outermost evaluable nodes become the artifact's holes: the root
 *     itself where it is one, or each hole of a vars-free root skeleton.
 *     A constant root has none.
 * 15. Each hole takes its shielding precompute — a constant `fallback`,
 *     authored or from `operatorDefaults`. Every hole shielded makes the
 *     artifact `shielded`.
 * 16. The issue stream is sorted into tree order (stably, so several issues
 *     on one node keep their emission order), and the counts and dependency
 *     lists ride out with the tree.
 */
import { ErrorCodes } from '../errorCodes'
import type { Severity } from '../issues'
import type { EvaluationMode } from '../operatorDefinition'
import { isPlainDataObject, nearestName } from '../utils'
import { resolveOperator, type OperatorRegistry, type RegistryEntry } from '../registry'
import { checkNameLegality } from '../names'
import { parsePath, type PathSegment } from '../primitives'
import { scanTemplate, type TemplateSegment } from '../templateTokens'
import { parseDrill, recognizeReference, renderSegments, splitSigilToken } from './references'
import { DEPTH_CEILING, isRecognizedShorthand, probeConstant } from './probe'
import type {
  ArtifactHole,
  CompiledNode,
  ConstantNode,
  ElementsNode,
  EntriesNode,
  FragmentCallNode,
  NodePath,
  OperatorNode,
  ParseArtifact,
  SequencedIssue,
  SkeletonHole,
  SkeletonNode,
} from './artifact'

/**
 * Registered fragments, keyed by name. Nothing is registrable until Phase
 * 11 — the parser takes the lookup now so fragment-body compilation reuses
 * this exact entry point.
 */
export type FragmentLookup = ReadonlyMap<string, unknown>

const NO_FRAGMENTS: FragmentLookup = new Map()

/** Reserved keys legal beside a `$name` shorthand key (the sibling rule). */
const SHORTHAND_SIBLINGS = new Set(['fallback', 'useCache', 'vars', '//'])

/** The reference-namespace words `as` names may not collide with. */
const NAMESPACE_WORDS = new Set(['data', 'vars', 'params', 'element', 'index', 'd', 'v', 'p', 'e', 'i'])

/** An active `as` renaming — pushed around perElement subtree walks. */
interface BindingFrame {
  element: string
  index: string
}

interface WalkState {
  registry: OperatorRegistry
  fragments: FragmentLookup
  issues: ParseArtifact['issues']
  order: number
  nodeCount: number
  maxDepth: number
  dataPaths: Set<string>
  dynamic: boolean
  operators: Set<string>
  fragmentNames: Set<string>
  identityOnly: boolean
  renamedBindings: BindingFrame[]
  /**
   * Every binding name any `as` in the expression declares, element and
   * derived index form alike — the material for the out-of-scope upgrade
   * below. Collected across the whole walk, not just the active frames.
   */
  asNames: Set<string>
  /**
   * `$`-tokens warned as unrecognized, each with the issue it raised. A
   * token naming a binding declared ANYWHERE is not unrecognized, it is
   * out of scope, and the walk cannot know that at the time: a depth-first
   * walk meets an iterator's `input` before its `as`.
   */
  unrecognized: { token: string; issue: SequencedIssue; raw: string }[]
}

/** Parse an expression into its compile artifact. Never throws on content. */
export const parseExpression = (
  input: unknown,
  registry: OperatorRegistry,
  fragments: FragmentLookup = NO_FRAGMENTS
): ParseArtifact => {
  const state: WalkState = {
    registry,
    fragments,
    issues: [],
    order: 0,
    nodeCount: 0,
    maxDepth: 0,
    dataPaths: new Set(),
    dynamic: false,
    operators: new Set(),
    fragmentNames: new Set(),
    identityOnly: false,
    renamedBindings: [],
    asNames: new Set(),
    unrecognized: [],
  }
  const root = walk(state, input, [], 0)
  upgradeOutOfScopeBindings(state)
  const holes = rootHoles(state, root)
  // Stable sort — issues from one node keep their emission order
  state.issues.sort((a, b) => a.order - b.order)
  return {
    root,
    holes,
    issues: state.issues,
    shielded: holes.every((hole) => hole.staticFallback !== undefined),
    nodeCount: state.nodeCount,
    maxDepth: state.maxDepth,
    dependencies: {
      dataPaths: [...state.dataPaths],
      dynamic: state.dynamic,
      operators: [...state.operators],
      fragments: [...state.fragmentNames],
    },
    identityOnly: state.identityOnly,
  }
}

/**
 * Turn "unrecognized `$`" into "out of scope" wherever the token names a
 * binding the expression actually declares.
 *
 * The grammar's default for a `$`-string it does not know is inert data
 * with a warning, which is right for `$typo` — it might just be data. It
 * is wrong for `$order` in the `input` of the very iterator that declares
 * `as: 'order'`: the author plainly meant the binding, and batch 5 says
 * references to an iterator's own bindings from outside its `each` subtree
 * are errors. `$element` is already an error there, because it is a
 * reserved namespace the walk recognizes everywhere; an `as` name is only
 * a namespace inside its own scope, which is exactly why this second look
 * is needed to treat the two alike.
 *
 * Rewritten on the issue record itself, so it keeps its emission order.
 */
const upgradeOutOfScopeBindings = (state: WalkState) => {
  if (state.asNames.size === 0) return
  for (const { token, issue: sequenced, raw } of state.unrecognized) {
    if (!state.asNames.has(token)) continue
    sequenced.issue = {
      ...sequenced.issue,
      severity: 'error',
      code: ErrorCodes.unresolvedBinding,
      message: `'${raw}' names an iterator binding, but no enclosing iterator binds it here`,
    }
  }
}

// ── Issue emission ──────────────────────────────────────────────────

const emit = (
  state: WalkState,
  severity: Severity,
  code: string,
  message: string,
  path: NodePath,
  order: number,
  operator?: string
): SequencedIssue => {
  const sequenced: SequencedIssue = {
    issue: {
      severity,
      code,
      message,
      path,
      ...(operator !== undefined ? { operator } : {}),
    },
    order,
  }
  state.issues.push(sequenced)
  return sequenced
}

// ── The walk ────────────────────────────────────────────────────────

const walk = (state: WalkState, raw: unknown, path: NodePath, depth: number): CompiledNode => {
  const order = state.order++
  if (depth > state.maxDepth) state.maxDepth = depth

  // The built-in ceiling: option-independent stack safety. Descent stops
  // here with an error issue; the user's `maxDepth` is a separate, per-call
  // comparison against the measured depth (FigTree.validate / evaluate)
  if (depth > DEPTH_CEILING) {
    emit(
      state,
      'error',
      ErrorCodes.depthCeiling,
      `the expression nests deeper than the engine's ceiling of ${DEPTH_CEILING} levels — descent stopped here`,
      path,
      order
    )
    state.nodeCount++
    return invalid(raw, path, order)
  }

  const node = compileValue(state, raw, path, depth, order)
  // nodeCount is the evaluable-node count (obligation B4): the nodes
  // evaluation visits. Named positively, so a new node kind is structure
  // until it is deliberately counted — constants, skeletons and the
  // element/entry parameter shapes are all structure around the work.
  if (
    node.kind === 'operator' ||
    node.kind === 'fragmentCall' ||
    node.kind === 'reference' ||
    node.kind === 'invalid'
  )
    state.nodeCount++
  return node
}

const compileValue = (
  state: WalkState,
  raw: unknown,
  path: NodePath,
  depth: number,
  order: number
): CompiledNode => {
  // undefined is not a value — JSON semantics (object keys are filtered by
  // the container walks; array elements and stray roots normalize to null)
  if (raw === undefined || raw === null) return constant(raw ?? null, path, order)
  if (typeof raw === 'number' || typeof raw === 'boolean') return constant(raw, path, order)
  if (typeof raw === 'string') return walkString(state, raw, path, order)
  if (Array.isArray(raw)) return walkArray(state, raw, path, depth, order)
  if (isPlainDataObject(raw)) return walkObject(state, raw, path, depth, order)
  // Class instances, Dates, Maps, functions… — opaque constants (C5)
  state.identityOnly = true
  return constant(raw, path, order)
}

const constant = (value: unknown, path: NodePath, order: number): ConstantNode => ({
  kind: 'constant',
  value,
  path,
  order,
})

const invalid = (raw: unknown, path: NodePath, order: number): CompiledNode => ({
  kind: 'invalid',
  raw,
  path,
  order,
})

// ── Strings: the reference token rule ───────────────────────────────

const walkString = (
  state: WalkState,
  raw: string,
  path: NodePath,
  order: number
): CompiledNode => {
  const recognition = recognizeReference(raw)
  switch (recognition.kind) {
    case 'plain':
      return constant(raw, path, order)
    case 'unrecognized': {
      const renamed = recognizeRenamedBinding(state, raw, path, order)
      if (renamed !== null) return renamed
      const issue = emit(
        state,
        'warning',
        ErrorCodes.unrecognizedIdentifier,
        `'${raw}' matches no reference namespace and will pass through as data`,
        path,
        order
      )
      const sigil = splitSigilToken(raw)
      if (sigil !== null) state.unrecognized.push({ token: sigil.token, issue, raw })
      return constant(raw, path, order)
    }
    case 'invalid':
      emit(state, 'error', ErrorCodes.invalidReference, `'${raw}': ${recognition.reason}`, path, order)
      return invalid(raw, path, order)
    case 'reference': {
      const { namespace, segments } = recognition
      if (namespace === 'data') {
        if (segments.length === 0) state.dynamic = true
        else state.dataPaths.add(renderSegments(segments))
      }
      return { kind: 'reference', namespace, segments, raw, path, order }
    }
  }
}

/** `$order` / `$orderIndex` against the active `as` frames. */
const recognizeRenamedBinding = (
  state: WalkState,
  raw: string,
  path: NodePath,
  order: number
): CompiledNode | null => {
  const split = splitSigilToken(raw)
  if (split === null) return null
  const { token, rest } = split
  for (let i = state.renamedBindings.length - 1; i >= 0; i--) {
    const frame = state.renamedBindings[i]
    if (token === frame.element) {
      try {
        const segments = parseDrill(rest)
        return { kind: 'reference', namespace: 'element', segments, raw, binding: token, path, order }
      } catch (error) {
        emit(state, 'error', ErrorCodes.invalidReference, `'${raw}': ${(error as Error).message}`, path, order)
        return invalid(raw, path, order)
      }
    }
    if (token === frame.index) {
      if (rest !== '') {
        emit(
          state,
          'error',
          ErrorCodes.invalidReference,
          `'${raw}': the index binding is bare-only — it cannot be drilled`,
          path,
          order
        )
        return invalid(raw, path, order)
      }
      return { kind: 'reference', namespace: 'index', segments: [], raw, binding: token, path, order }
    }
  }
  return null
}

// ── Arrays ──────────────────────────────────────────────────────────

const walkArray = (
  state: WalkState,
  raw: unknown[],
  path: NodePath,
  depth: number,
  order: number
): CompiledNode => {
  const entries = raw.map((element, i) => ({
    key: i as string | number,
    rawChild: element === undefined ? null : element,
    node: walk(state, element === undefined ? null : element, [...path, i], depth + 1),
  }))
  const changed = raw.some((element) => element === undefined)
  return assembleContainer(state, raw, entries, true, changed, undefined, path, order)
}

// ── Objects: node-kind classification ───────────────────────────────

/** The `$name` keys of an object that resolve against what's known. */
const recognizedShorthandKeys = (state: WalkState, raw: Record<string, unknown>): string[] =>
  Object.keys(raw).filter(
    (key) => key.startsWith('$') && isRecognizedShorthand(state, key.slice(1))
  )

/** Would this value classify as a node (kinds 1–3, 5)? */
const classifiesAsNode = (state: WalkState, value: unknown): boolean =>
  isPlainDataObject(value) &&
  ('operator' in value || 'fragment' in value || recognizedShorthandKeys(state, value).length > 0)

const walkObject = (
  state: WalkState,
  raw: Record<string, unknown>,
  path: NodePath,
  depth: number,
  order: number
): CompiledNode => {
  const hasOperator = 'operator' in raw
  const hasFragment = 'fragment' in raw
  const shorthand = recognizedShorthandKeys(state, raw)

  if (hasOperator && hasFragment) {
    emit(
      state,
      'error',
      ErrorCodes.malformedNode,
      "'operator' and 'fragment' may not share a node",
      path,
      order
    )
    return invalid(raw, path, order)
  }
  if ((hasOperator || hasFragment) && shorthand.length > 0) {
    emit(
      state,
      'error',
      ErrorCodes.malformedNode,
      `a canonical '${hasOperator ? 'operator' : 'fragment'}' key may not sit beside the shorthand key '${shorthand[0]}'`,
      path,
      order
    )
    return invalid(raw, path, order)
  }
  if (hasOperator) return walkOperatorCanonical(state, raw, path, depth, order)
  if (hasFragment) return walkFragmentCanonical(state, raw, path, depth, order)
  if (shorthand.length >= 2) {
    emit(
      state,
      'error',
      ErrorCodes.malformedNode,
      `one node, one invocation: found ${shorthand.map((k) => `'${k}'`).join(' and ')}`,
      path,
      order
    )
    return invalid(raw, path, order)
  }
  if (shorthand.length === 1) return walkShorthand(state, raw, shorthand[0], path, depth, order)
  return walkPlainObject(state, raw, path, depth, order)
}

// ── Operator nodes: param collection then finalization ──────────────

/**
 * A parameter awaiting its walk. Collection and walking are separated so
 * structural `as` values can be read (and the binding frame pushed) before
 * any perElement subtree walks.
 */
type PendingParam =
  | { name: string; kind: 'value'; value: unknown; path: NodePath }
  | { name: string; kind: 'slice'; elements: unknown[]; basePath: NodePath; offset: number }

const walkOperatorCanonical = (
  state: WalkState,
  raw: Record<string, unknown>,
  path: NodePath,
  depth: number,
  order: number
): CompiledNode => {
  const opValue = raw.operator
  if (typeof opValue !== 'string') {
    emit(
      state,
      'error',
      ErrorCodes.malformedNode,
      "the 'operator' value must be a literal string",
      path,
      order
    )
    return invalid(raw, path, order)
  }
  if (opValue === 'literal') return walkLiteral(state, raw, raw.value, 'value' in raw, path, order)

  const entry = resolveOperator(state.registry, opValue)
  if (entry === undefined) {
    const suggestion = nearestName(opValue, allInvocationNames(state))
    emit(
      state,
      'error',
      ErrorCodes.unknownOperator,
      `'${opValue}' names no registered operator${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
      path,
      order
    )
    return invalid(raw, path, order)
  }

  const node = startOperatorNode(state, entry, path, order)
  const pending: PendingParam[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'operator' || key === '//' || value === undefined) continue
    if (applyOperatorModifier(state, node, key, value, path, depth, order)) continue
    if (key === 'parameters') {
      emit(
        state,
        'error',
        ErrorCodes.malformedNode,
        "'parameters' is reserved and unused on operator nodes",
        [...path, key],
        order,
        node.name
      )
      continue
    }
    collectNamedParam(state, node, pending, key, value, [...path, key], order)
  }
  finalizeParams(state, node, pending, depth, order)
  return node
}

/** Fresh operator node; records the dependency-list entry. */
const startOperatorNode = (
  state: WalkState,
  entry: RegistryEntry,
  path: NodePath,
  order: number
): OperatorNode => {
  state.operators.add(entry.definition.name)
  return {
    kind: 'operator',
    name: entry.definition.name,
    entry,
    params: {},
    path,
    order,
  }
}

/**
 * Handle a reserved modifier key on an operator node (canonical or
 * shorthand face). Returns true when the key was a modifier. Modifiers are
 * outside any perElement binding scope, so they walk immediately.
 */
const applyOperatorModifier = (
  state: WalkState,
  node: OperatorNode,
  key: string,
  value: unknown,
  path: NodePath,
  depth: number,
  order: number
): boolean => {
  if (key === 'fallback') {
    node.fallback = walk(state, value, [...path, 'fallback'], depth + 1)
    return true
  }
  if (key === 'useCache') {
    if (typeof value === 'boolean') node.useCache = value
    else
      emit(
        state,
        'error',
        ErrorCodes.malformedNode,
        "'useCache' must be a literal boolean — the cache lookup happens before evaluation",
        [...path, 'useCache'],
        order,
        node.name
      )
    return true
  }
  if (key === 'vars') {
    node.vars = compileVars(state, value, path, depth, order)
    return true
  }
  return false
}

/** Queue a named parameter (canonical node key or named-payload key). */
const collectNamedParam = (
  state: WalkState,
  node: OperatorNode,
  pending: PendingParam[],
  key: string,
  value: unknown,
  path: NodePath,
  order: number
) => {
  if (node.entry.definition.parameters[key] === undefined) {
    const suggestion = nearestName(key, Object.keys(node.entry.definition.parameters))
    emit(
      state,
      'error',
      ErrorCodes.unknownNodeKey,
      `'${key}' is not a parameter of '${node.name}'${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
      path,
      order,
      node.name
    )
    return
  }
  pending.push({ name: key, kind: 'value', value, path })
}

/**
 * Walk the queued parameters: structural `as` first (building the binding
 * frame), then ordinary parameters, then perElement subtrees under the
 * frame — the batch-5 rule that the binding scope is exactly the each
 * subtree.
 */
const finalizeParams = (
  state: WalkState,
  node: OperatorNode,
  pending: PendingParam[],
  depth: number,
  order: number
) => {
  const definition = node.entry.definition
  const perElement = new Set(
    Object.entries(definition.parameters)
      .filter(([, decl]) => decl.evaluation === 'perElement')
      .map(([name]) => name)
  )

  let frame: BindingFrame | undefined
  if (perElement.size > 0) {
    const asPending = pending.find(
      (entry) =>
        entry.name === 'as' &&
        definition.parameters.as?.evaluation === 'structural' &&
        entry.kind === 'value'
    )
    if (asPending !== undefined && asPending.kind === 'value')
      frame = buildBindingFrame(state, node, asPending.value, asPending.path, order)
  }

  for (const entry of pending) {
    if (perElement.has(entry.name)) continue
    const evaluation = definition.parameters[entry.name]?.evaluation
    node.params[entry.name] = walkPending(state, entry, evaluation, depth)
  }
  if (frame !== undefined) state.renamedBindings.push(frame)
  for (const entry of pending) {
    if (!perElement.has(entry.name)) continue
    const evaluation = definition.parameters[entry.name]?.evaluation
    node.params[entry.name] = walkPending(state, entry, evaluation, depth)
  }
  if (frame !== undefined) state.renamedBindings.pop()

  recordGetDependency(state, node)
  compileTemplate(state, node)
}

// ── buildString: the template scan ──────────────────────────────────

/** What the authored `substitutions` face is, as far as it is knowable. */
type SubstitutionFace =
  | { mode: 'absent' }
  | { mode: 'array'; length: number }
  | { mode: 'object'; keys: Set<string> }
  | { mode: 'dynamic' }

const readFace = (supplied: CompiledNode | undefined): SubstitutionFace => {
  if (supplied === undefined) return { mode: 'absent' }
  if (supplied.kind === 'constant') {
    if (Array.isArray(supplied.value)) return { mode: 'array', length: supplied.value.length }
    if (isPlainDataObject(supplied.value))
      return { mode: 'object', keys: new Set(Object.keys(supplied.value)) }
    return { mode: 'dynamic' }
  }
  if (supplied.kind === 'skeleton') {
    const { skeleton, holes } = supplied
    if (Array.isArray(skeleton)) return { mode: 'array', length: skeleton.length }
    if (isPlainDataObject(skeleton)) {
      // A hole's key is absent from the skeleton — the two halves together
      // are the authored key set
      const keys = new Set(Object.keys(skeleton))
      for (const hole of holes) keys.add(String(hole.at[0]))
      return { mode: 'object', keys }
    }
  }
  return { mode: 'dynamic' }
}

/**
 * `buildString`'s parse-time half, and the one place a template is ever
 * scanned for references (References rule 4's sanctioned embedding): a
 * LITERAL template is authored tree, so `{{$data.x}}` in one IS that
 * reference, while a template arriving as data can never mint itself a
 * data read.
 *
 * A recognized reference desugars into `substitutions` under the token's
 * own text as its key — collision-free by construction, since a
 * reference-shaped token is always resolved as a reference and a
 * well-formed NAMED token body must be a plain identifier, which
 * `$d.first` is not. The template is left byte-unchanged, and the body
 * then needs no reference machinery at all: it looks the token body up in
 * `substitutions` exactly as it does for `{{name}}`.
 *
 * The desugar needs an object to grow, so it reaches the named face and
 * the no-substitutions face only; beside an array or a dynamically
 * supplied map a reference token is not recognized, renders itself, and
 * draws a warning here (ruled with Carl, September 2026).
 *
 * The literal-face findings live here rather than in a `validate` hook
 * for the same reason: the injection turns `substitutions` into a
 * skeleton, and hooks see constant parameters only.
 */
const compileTemplate = (state: WalkState, node: OperatorNode) => {
  if (node.name !== 'buildString') return
  const template = node.params.template
  if (template?.kind !== 'constant' || typeof template.value !== 'string') return

  const segments = scanTemplate(template.value)
  const tokens = segments.filter((segment) => segment.kind !== 'text')
  if (tokens.length === 0) return

  const supplied = node.params.substitutions
  const face = readFace(supplied)
  reportTemplateFace(state, node, template, tokens, face)

  if (face.mode !== 'absent' && face.mode !== 'object') return

  const holes: SkeletonHole[] = []
  const bound = new Set<string>()
  for (const segment of tokens) {
    if (segment.kind !== 'named' || !segment.body.startsWith('$')) continue
    // Repeats share one evaluation — the same key, bound once
    if (bound.has(segment.body)) continue
    const compiled = walkString(state, segment.body, template.path, state.order++)
    if (compiled.kind !== 'reference') continue
    state.nodeCount++
    bound.add(segment.body)
    holes.push({ path: template.path, at: [segment.body], node: compiled })
  }
  if (holes.length === 0) return

  node.params.substitutions = growSubstitutions(state, node, supplied, holes)
}

/** The authored map plus the desugared references, as one skeleton. */
const growSubstitutions = (
  state: WalkState,
  node: OperatorNode,
  supplied: CompiledNode | undefined,
  injected: SkeletonHole[]
): SkeletonNode => {
  const base: SkeletonNode =
    supplied?.kind === 'skeleton'
      ? { ...supplied, skeleton: { ...(supplied.skeleton as object) }, holes: [...supplied.holes] }
      : {
          kind: 'skeleton',
          // The authored object is copied, never mutated (obligation C4)
          skeleton: supplied?.kind === 'constant' ? { ...(supplied.value as object) } : {},
          holes: [],
          path: supplied?.path ?? [...node.path, 'substitutions'],
          order: supplied?.order ?? state.order++,
        }
  base.holes.push(...injected)
  return base
}

/**
 * The literal-face findings, all warnings: the runtime behaviour they
 * describe is defined and graceful (an unbound token renders its own
 * text), so an error — which would refuse the expression outright — would
 * also refuse a percent-encoded URL in a positional template, the case
 * the no-escape design leans on.
 *
 * Cross-style tokens draw nothing: they are deliberately inert, which is
 * what makes generating a Mustache template positional mode's job.
 */
const reportTemplateFace = (
  state: WalkState,
  node: OperatorNode,
  template: ConstantNode,
  tokens: Exclude<TemplateSegment, { kind: 'text' }>[],
  face: SubstitutionFace
) => {
  const warn = (code: string, message: string, severity: Severity = 'warning') =>
    emit(state, severity, code, message, template.path, template.order, node.name)

  if (face.mode === 'array' || face.mode === 'dynamic') {
    if (tokens.some((token) => token.kind === 'named' && token.body.startsWith('$')))
      warn(
        ErrorCodes.inertReferenceToken,
        `a reference token needs the named face — beside ${
          face.mode === 'array' ? 'positional substitutions' : 'a dynamically supplied map'
        } it is not recognized and renders as its own text`
      )
  }

  if (face.mode === 'array') {
    const used = new Set<number>()
    for (const token of tokens) {
      if (token.kind !== 'positional') continue
      if (token.index >= 1 && token.index <= face.length) {
        used.add(token.index)
        continue
      }
      warn(ErrorCodes.unboundToken, `'${token.raw}' binds to nothing and renders as its own text`)
    }
    const spare = []
    for (let i = 1; i <= face.length; i++) if (!used.has(i)) spare.push(i)
    for (const index of spare)
      warn(ErrorCodes.unusedSubstitution, `substitution ${index} is never named by the template`)
    // A gap plus a spare slot is the quick-edit slip strict indexing is
    // designed to make visible rather than silently mis-bind
    if (spare.length > 0 && used.size < tokens.filter((t) => t.kind === 'positional').length)
      warn(
        ErrorCodes.tokenRenumber,
        `the tokens skip a number — renumber them to ${[...Array(face.length).keys()]
          .map((i) => `%${i + 1}`)
          .join(', ')}`,
        'hint'
      )
    return
  }

  if (face.mode === 'object') {
    const used = new Set<string>()
    for (const token of tokens) {
      if (token.kind !== 'named') continue
      if (face.keys.has(token.body)) {
        used.add(token.body)
        continue
      }
      // A reference token binds through the desugar, not the map
      if (token.body.startsWith('$')) continue
      warn(ErrorCodes.unboundToken, `'${token.raw}' binds to nothing and renders as its own text`)
    }
    for (const key of face.keys)
      if (!used.has(key))
        warn(ErrorCodes.unusedSubstitution, `substitution '${key}' is never named by the template`)
  }
}

/**
 * `get` reads `$data` too, so its paths belong in the dependency list
 * (obligation B6) on exactly the sugar equivalence that defines the
 * operator: `{ $get: 'a.b' }` ≡ `"$data.a.b"`. A literal path joins the
 * list as written, projections included; a computed one makes the
 * read-set unenumerable, which is what `dynamic` is for. A supplied
 * `from` contributes neither — the read is not against `$data` at all.
 */
const recordGetDependency = (state: WalkState, node: OperatorNode) => {
  if (node.name !== 'get' || node.params.from !== undefined) return
  const path = node.params.path
  if (path === undefined) return
  if (path.kind !== 'constant') {
    state.dynamic = true
    return
  }
  try {
    const segments = typeof path.value === 'string' ? parsePath(path.value) : path.value
    if (Array.isArray(segments)) state.dataPaths.add(renderSegments(segments as PathSegment[]))
  } catch {
    // A malformed literal path is the validate hook's finding to report
  }
}

const walkPending = (
  state: WalkState,
  entry: PendingParam,
  evaluation: EvaluationMode | undefined,
  depth: number
): CompiledNode => {
  // The element- and entry-addressable modes keep a literal payload out of
  // the enclosing skeleton, whose maximal holes cannot express "one
  // demandable unit per element". Both return null when the supplied value
  // is not the literal shape, leaving the ordinary walk to compile it and
  // the runtime degeneration rule to hand the body pre-resolved handles.
  if (evaluation === 'lazyElements' || evaluation === 'race') {
    const elements = walkElementsParam(state, entry, depth)
    if (elements !== null) return elements
  }
  if (evaluation === 'lazyEntries') {
    const entries = walkEntriesParam(state, entry, depth)
    if (entries !== null) return entries
  }
  if (entry.kind === 'value') return walk(state, entry.value, entry.path, depth + 1)
  return walkSlice(state, entry, depth)
}

/**
 * A rest-slice payload as an ordinary container. The synthetic container
 * takes its `order` before its elements walk — it is their parent, and
 * `order` is a preorder position (obligation A3), the sort key the issue
 * stream relies on — and occupies a depth level of its own, so an
 * expression measures the same `maxDepth` through its shorthand face as
 * through its canonical one.
 */
const walkSlice = (
  state: WalkState,
  entry: Extract<PendingParam, { kind: 'slice' }>,
  depth: number
): CompiledNode => {
  const { order, containerDepth } = openSynthetic(state, depth)
  const children = sliceChildren(state, entry.elements, entry.basePath, entry.offset, containerDepth)
  const changed = entry.elements.some((element) => element === undefined)
  return assembleContainer(
    state,
    entry.elements,
    children,
    true,
    changed,
    undefined,
    entry.basePath,
    order
  )
}

/** Take a synthetic container's preorder position and its depth level. */
const openSynthetic = (state: WalkState, depth: number): { order: number; containerDepth: number } => {
  const order = state.order++
  const containerDepth = depth + 1
  if (containerDepth > state.maxDepth) state.maxDepth = containerDepth
  return { order, containerDepth }
}

const sliceChildren = (
  state: WalkState,
  elements: unknown[],
  basePath: NodePath,
  offset: number,
  containerDepth: number
): ContainerEntry[] =>
  elements.map((element, j) => ({
    key: j as string | number,
    rawChild: element === undefined ? null : element,
    node: walk(
      state,
      element === undefined ? null : element,
      [...basePath, offset + j],
      containerDepth + 1
    ),
  }))

/**
 * A `lazyElements` / `race` parameter supplied as a literal array: one
 * compiled node per element, indexed by position in `nodes` (the
 * parameter-relative index the body's ordering obligations are about —
 * never the authored path's tail, which a leading positional shifts).
 *
 * An all-constant array falls through to ordinary assembly, yielding a
 * ConstantNode: the runtime degeneration rule turns it back into handles,
 * and it stays visible to `validate` hooks, which see constant parameters
 * only — that is what keeps the dead-expression warnings on `{ $and: [] }`
 * and `{ $firstOf: [] }` working.
 */
const walkElementsParam = (
  state: WalkState,
  entry: PendingParam,
  depth: number
): CompiledNode | null => {
  const raw = entry.kind === 'slice' ? entry.elements : entry.value
  if (!Array.isArray(raw)) return null
  const basePath = entry.kind === 'slice' ? entry.basePath : entry.path
  const offset = entry.kind === 'slice' ? entry.offset : 0

  const { order, containerDepth } = openSynthetic(state, depth)
  const children = sliceChildren(state, raw, basePath, offset, containerDepth)

  if (children.every((child) => child.node.kind === 'constant')) {
    const changed = raw.some((element) => element === undefined)
    return assembleContainer(state, raw, children, true, changed, undefined, basePath, order)
  }
  const node: ElementsNode = {
    kind: 'elements',
    nodes: children.map((child) => child.node),
    path: basePath,
    order,
  }
  return node
}

/**
 * A `lazyEntries` parameter supplied as a literal map: static keys mapping
 * to individually-demandable expressions. The literal-vs-dynamic decision
 * is the standard node classification, so a map that reads as a node takes
 * the dynamic face instead — which is what makes a branch key named
 * `operator` the loud malformed-node error the passes record, and a
 * single-`$name` map a shorthand node. Key handling is shared with every
 * other plain object: `//` stripped, `undefined` values dropped, a `vars`
 * block consumed and carried, stray `$name` keys warned.
 */
const walkEntriesParam = (
  state: WalkState,
  entry: PendingParam,
  depth: number
): CompiledNode | null => {
  if (entry.kind !== 'value') return null
  const raw = entry.value
  if (!isPlainDataObject(raw) || classifiesAsNode(state, raw)) return null

  const { order, containerDepth } = openSynthetic(state, depth)
  const { entries, vars, changed } = collectPlainObject(
    state,
    raw,
    entry.path,
    containerDepth,
    order
  )

  if (entries.every((child) => child.node.kind === 'constant'))
    return assembleContainer(state, raw, entries, false, changed, vars, entry.path, order)

  const compiled: Record<string, CompiledNode> = {}
  for (const { key, node } of entries) compiled[String(key)] = node
  const node: EntriesNode = { kind: 'entries', entries: compiled, path: entry.path, order }
  if (vars !== undefined) node.vars = vars
  return node
}

/**
 * Validate an `as` value and build its binding frame. `as` is structural —
 * a parse-time literal identifier; a dynamic value is a parse error. Names
 * are checked against the shared legality rule, the reserved namespace
 * words (long and short forms) and every enclosing `as` name, derived
 * `…Index` forms included ("$element / $index and as" in
 * docs-dev/v3-specs/v3-api.md).
 */
const buildBindingFrame = (
  state: WalkState,
  node: OperatorNode,
  value: unknown,
  path: NodePath,
  order: number
): BindingFrame | undefined => {
  const asError = (message: string) => {
    emit(state, 'error', ErrorCodes.invalidAs, message, path, order, node.name)
    return undefined
  }
  if (typeof value !== 'string' || recognizeReference(value).kind !== 'plain')
    return asError("'as' must be a literal name — a dynamic value cannot be statically resolved")
  const legality = checkNameLegality(value)
  if (!legality.ok) return asError(`'${value}' is not a legal binding name — ${legality.reason}`)

  const names = [value, `${value}Index`]
  for (const name of names) {
    if (NAMESPACE_WORDS.has(name))
      return asError(`'${value}' collides with the reserved namespace word '${name}'`)
    for (const enclosing of state.renamedBindings) {
      if (name === enclosing.element || name === enclosing.index)
        return asError(`'${value}' collides with an enclosing 'as' binding ('${name}')`)
    }
  }
  for (const name of names) state.asNames.add(name)
  return { element: value, index: `${value}Index` }
}

// ── Shorthand nodes ─────────────────────────────────────────────────

const walkShorthand = (
  state: WalkState,
  raw: Record<string, unknown>,
  shorthandKey: string,
  path: NodePath,
  depth: number,
  order: number
): CompiledNode => {
  const name = shorthandKey.slice(1)
  const isLiteral = name === 'literal'
  const isFragment = !isLiteral && state.fragments.has(name)

  // The sibling-key rule: reserved modifiers only
  for (const key of Object.keys(raw)) {
    if (key === shorthandKey) continue
    const allowed = SHORTHAND_SIBLINGS.has(key) && !(isFragment && key === 'useCache')
    if (!allowed) {
      emit(
        state,
        'error',
        ErrorCodes.malformedNode,
        `'${key}' may not sit beside the shorthand key '${shorthandKey}' — reserved modifiers only`,
        [...path, key],
        order
      )
      return invalid(raw, path, order)
    }
  }

  const payload = raw[shorthandKey]
  const payloadPath = [...path, shorthandKey]

  if (isLiteral) {
    // Dead modifiers: legal, warned, never compiled (nothing can run)
    for (const key of ['fallback', 'vars', 'useCache']) {
      if (key in raw)
        emit(
          state,
          'warning',
          ErrorCodes.uselessModifier,
          `'${key}' on 'literal' is dead — contents are never evaluated`,
          [...path, key],
          order
        )
    }
    return walkLiteral(state, raw, payload, true, path, order)
  }

  if (isFragment) return walkFragmentShorthand(state, raw, name, payload, path, depth, order)

  const entry = resolveOperator(state.registry, name)!
  const node = startOperatorNode(state, entry, path, order)
  for (const [key, value] of Object.entries(raw)) {
    if (key === shorthandKey || key === '//' || value === undefined) continue
    applyOperatorModifier(state, node, key, value, path, depth, order)
  }
  const pending: PendingParam[] = []
  collectShorthandPayload(state, node, pending, payload, payloadPath, order)
  finalizeParams(state, node, pending, depth, order)
  return node
}

/** Payload disambiguation by JSON type ("Shorthand grammar"). */
const collectShorthandPayload = (
  state: WalkState,
  node: OperatorNode,
  pending: PendingParam[],
  payload: unknown,
  payloadPath: NodePath,
  order: number
) => {
  if (Array.isArray(payload)) {
    collectPositional(state, node, pending, payload, payloadPath, order)
    return
  }
  // A plain (non-node) object payload is named parameters, always; an
  // object that classifies as a node is the single positional argument —
  // sound for the same reason as the fragments disambiguation: parameter
  // names cannot start with '$', and 'operator'/'fragment' are reserved
  if (isPlainDataObject(payload) && !classifiesAsNode(state, payload)) {
    for (const [key, value] of Object.entries(payload)) {
      if (key === '//' || value === undefined) continue
      collectNamedParam(state, node, pending, key, value, [...payloadPath, key], order)
    }
    return
  }
  collectSinglePositional(state, node, pending, payload, payloadPath, order)
}

/** A single non-array payload binds to the first position, verbatim. */
const collectSinglePositional = (
  state: WalkState,
  node: OperatorNode,
  pending: PendingParam[],
  payload: unknown,
  payloadPath: NodePath,
  order: number
) => {
  const definition = node.entry.definition
  const first = definition.positionalParams?.[0]
  if (first === undefined) {
    emit(
      state,
      'error',
      ErrorCodes.positionalArity,
      `'${node.name}' takes no positional arguments — use the named form`,
      payloadPath,
      order,
      node.name
    )
    return
  }
  const target = first.startsWith('...') ? definition.restParam! : first
  pending.push({ name: target, kind: 'value', value: payload, path: payloadPath })
}

/** Array payload → positionalParams mapping (greedy, left-to-right). */
const collectPositional = (
  state: WalkState,
  node: OperatorNode,
  pending: PendingParam[],
  payload: unknown[],
  payloadPath: NodePath,
  order: number
) => {
  const definition = node.entry.definition
  const positional = definition.positionalParams
  if (positional === undefined) {
    emit(
      state,
      'error',
      ErrorCodes.positionalArity,
      `'${node.name}' takes no positional arguments — use the named form`,
      payloadPath,
      order,
      node.name
    )
    return
  }
  const leading = positional.filter((entry) => !entry.startsWith('...'))
  const rest = definition.restParam

  if (payload.length > leading.length && rest === null) {
    emit(
      state,
      'error',
      ErrorCodes.positionalArity,
      `'${node.name}' takes at most ${leading.length} positional argument${
        leading.length === 1 ? '' : 's'
      } (${leading.join(', ')}), got ${payload.length}`,
      payloadPath,
      order,
      node.name
    )
    return
  }

  const boundLeading = Math.min(payload.length, leading.length)
  for (let i = 0; i < boundLeading; i++) {
    pending.push({ name: leading[i], kind: 'value', value: payload[i], path: [...payloadPath, i] })
  }
  // The rest slice binds whenever the payload is an array — an empty
  // payload binds an empty array ({ $and: [] } → values: []), which is the
  // vacuous-identity / empty-aggregate case the passes define, not an
  // omission
  if (rest !== null && payload.length >= leading.length) {
    pending.push({
      name: rest,
      kind: 'slice',
      elements: payload.slice(leading.length),
      basePath: payloadPath,
      offset: leading.length,
    })
  }
}

// ── literal: the parse boundary ─────────────────────────────────────

const walkLiteral = (
  state: WalkState,
  raw: Record<string, unknown>,
  content: unknown,
  hasContent: boolean,
  path: NodePath,
  order: number
): CompiledNode => {
  // Canonical face: check keys (dead modifiers warn, unknown keys error)
  if ('operator' in raw) {
    for (const key of Object.keys(raw)) {
      if (key === 'operator' || key === 'value' || key === '//') continue
      if (key === 'fallback' || key === 'vars' || key === 'useCache') {
        emit(
          state,
          'warning',
          ErrorCodes.uselessModifier,
          `'${key}' on 'literal' is dead — contents are never evaluated`,
          [...path, key],
          order
        )
        continue
      }
      emit(
        state,
        'error',
        ErrorCodes.unknownNodeKey,
        `'${key}' is not a key of 'literal' — content goes in 'value'`,
        [...path, key],
        order,
        'literal'
      )
    }
    if (!hasContent) {
      emit(
        state,
        'error',
        ErrorCodes.malformedNode,
        "'literal' requires its content in 'value'",
        path,
        order,
        'literal'
      )
      return invalid(raw, path, order)
    }
  }
  // Contents are constant by fiat: never walked, validated or counted
  return constant(content, path, order)
}

// ── Fragment calls ──────────────────────────────────────────────────

const walkFragmentCanonical = (
  state: WalkState,
  raw: Record<string, unknown>,
  path: NodePath,
  depth: number,
  order: number
): CompiledNode => {
  const fragValue = raw.fragment
  if (typeof fragValue !== 'string') {
    emit(
      state,
      'error',
      ErrorCodes.malformedNode,
      "the 'fragment' value must be a literal string",
      path,
      order
    )
    return invalid(raw, path, order)
  }
  checkFragmentKnown(state, fragValue, path, order)

  const node: FragmentCallNode = {
    kind: 'fragmentCall',
    name: fragValue,
    argumentsMode: 'static',
    path,
    order,
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'fragment' || key === '//' || value === undefined) continue
    if (key === 'parameters') {
      compileFragmentParameters(state, node, value, [...path, 'parameters'], depth, order)
      continue
    }
    if (key === 'fallback') {
      node.fallback = walk(state, value, [...path, 'fallback'], depth + 1)
      continue
    }
    if (key === 'vars') {
      node.vars = compileVars(state, value, path, depth, order)
      continue
    }
    if (key === 'useCache') {
      emit(
        state,
        'error',
        ErrorCodes.malformedNode,
        "'useCache' is not available on fragment calls — caching stays operator-level",
        [...path, 'useCache'],
        order
      )
      continue
    }
    emit(
      state,
      'error',
      ErrorCodes.unknownNodeKey,
      `'${key}' is not a key of a fragment call — arguments live only in 'parameters'`,
      [...path, key],
      order
    )
  }
  return node
}

const walkFragmentShorthand = (
  state: WalkState,
  raw: Record<string, unknown>,
  name: string,
  payload: unknown,
  path: NodePath,
  depth: number,
  order: number
): CompiledNode => {
  checkFragmentKnown(state, name, path, order)
  const node: FragmentCallNode = {
    kind: 'fragmentCall',
    name,
    argumentsMode: 'static',
    path,
    order,
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key === `$${name}` || key === '//' || value === undefined) continue
    if (key === 'fallback') node.fallback = walk(state, value, [...path, 'fallback'], depth + 1)
    if (key === 'vars') node.vars = compileVars(state, value, path, depth, order)
  }
  if (isPlainDataObject(payload)) {
    compileFragmentParameters(state, node, payload, [...path, `$${name}`], depth, order)
  } else {
    emit(
      state,
      'error',
      ErrorCodes.malformedNode,
      `fragments have no single-value or positional form — '$${name}' takes a named-arguments object`,
      [...path, `$${name}`],
      order
    )
  }
  return node
}

const checkFragmentKnown = (state: WalkState, name: string, path: NodePath, order: number) => {
  state.fragmentNames.add(name)
  if (!state.fragments.has(name)) {
    const suggestion = nearestName(name, state.fragments.keys())
    emit(
      state,
      'error',
      ErrorCodes.unknownFragment,
      `'${name}' names no registered fragment${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
      path,
      order
    )
  }
}

/**
 * The two argument modes, decided statically: a plain (non-node) object is
 * the static named-arguments map; a node or reference string is the dynamic
 * mode; anything else is a hard error. A reference-string *shorthand
 * payload* never reaches here (banned face — the caller errors first).
 */
const compileFragmentParameters = (
  state: WalkState,
  node: FragmentCallNode,
  value: unknown,
  path: NodePath,
  depth: number,
  order: number
) => {
  if (value === undefined) return // zero-argument call
  if (
    classifiesAsNode(state, value) ||
    (typeof value === 'string' && recognizeReference(value).kind === 'reference')
  ) {
    node.argumentsMode = 'dynamic'
    node.parameters = walk(state, value, path, depth + 1)
    state.dynamic = true
    return
  }
  if (isPlainDataObject(value)) {
    const parameters: Record<string, CompiledNode> = {}
    for (const [key, argument] of Object.entries(value)) {
      if (key === '//' || argument === undefined) continue
      parameters[key] = walk(state, argument, [...path, key], depth + 1)
    }
    node.parameters = parameters
    return
  }
  emit(
    state,
    'error',
    ErrorCodes.malformedNode,
    "a fragment's 'parameters' must be a named-arguments object or a node computing one",
    path,
    order
  )
}

// ── vars blocks ─────────────────────────────────────────────────────

/**
 * A vars block is structural, never a node: static names (legality-checked)
 * mapping to ordinary compiled expressions. Shape violations are loud.
 */
const compileVars = (
  state: WalkState,
  value: unknown,
  nodePath: NodePath,
  depth: number,
  order: number
): Record<string, CompiledNode> | undefined => {
  if (!isPlainDataObject(value)) {
    emit(
      state,
      'error',
      ErrorCodes.invalidVars,
      "a 'vars' block must be an object of name → expression entries",
      [...nodePath, 'vars'],
      order
    )
    return undefined
  }
  const map: Record<string, CompiledNode> = {}
  for (const [name, expression] of Object.entries(value)) {
    if (name === '//' || expression === undefined) continue
    const legality = checkNameLegality(name)
    if (!legality.ok) {
      emit(
        state,
        'error',
        ErrorCodes.invalidName,
        `'${name}' is not a legal var name — ${legality.reason}`,
        [...nodePath, 'vars', name],
        order
      )
      continue
    }
    map[name] = walk(state, expression, [...nodePath, 'vars', name], depth + 1)
  }
  return map
}

// ── Plain literals ──────────────────────────────────────────────────

const walkPlainObject = (
  state: WalkState,
  raw: Record<string, unknown>,
  path: NodePath,
  depth: number,
  order: number
): CompiledNode => {
  const { entries, vars, changed } = collectPlainObject(state, raw, path, depth, order)
  return assembleContainer(state, raw, entries, false, changed, vars, path, order)
}

/**
 * The plain-object walk, short of assembly: consumed keys stripped, stray
 * `$name` keys warned, every remaining value compiled. Shared with the
 * `lazyEntries` parameter path, so a branch map's keys obey exactly the
 * rules every other plain object's keys obey.
 */
const collectPlainObject = (
  state: WalkState,
  raw: Record<string, unknown>,
  path: NodePath,
  depth: number,
  order: number
): { entries: ContainerEntry[]; vars?: Record<string, CompiledNode>; changed: boolean } => {
  let vars: Record<string, CompiledNode> | undefined
  let changed = false
  const entries: ContainerEntry[] = []

  for (const [key, value] of Object.entries(raw)) {
    if (key === '//') {
      changed = true
      continue
    }
    if (key === 'vars') {
      // Functional & consumed on plain object literals
      vars = compileVars(state, value, path, depth, order)
      changed = true
      continue
    }
    if (value === undefined) {
      changed = true
      continue
    }
    if (key.startsWith('$')) {
      // No recognized keys here (walkObject dispatched those) — inert +
      // warn, at the containing object's path (the worked-example shape)
      const suggestion = nearestName(key.slice(1), allInvocationNames(state))
      emit(
        state,
        'warning',
        ErrorCodes.unrecognizedIdentifier,
        `'${key}' is not a registered operator or fragment and will pass through as data${
          suggestion ? ` — did you mean '$${suggestion}'?` : ''
        }`,
        path,
        order
      )
    }
    entries.push({ key, rawChild: value, node: walk(state, value, [...path, key], depth + 1) })
  }
  return { entries, vars, changed }
}

// ── Container assembly: constancy, skeleton, holes ──────────────────

interface ContainerEntry {
  key: string | number
  rawChild: unknown
  node: CompiledNode
}

const assembleContainer = (
  state: WalkState,
  raw: unknown,
  entries: ContainerEntry[],
  isArray: boolean,
  alreadyChanged: boolean,
  vars: Record<string, CompiledNode> | undefined,
  path: NodePath,
  order: number
): CompiledNode => {
  const holes: SkeletonHole[] = []
  const skeleton: Record<string | number, unknown> = isArray
    ? (new Array(entries.length) as unknown as Record<string | number, unknown>)
    : {}
  let changed = alreadyChanged

  for (const { key, rawChild, node } of entries) {
    if (node.kind === 'constant') {
      skeleton[key] = node.value
      if (node.value !== rawChild) changed = true
      continue
    }
    changed = true
    // Nested plain literals flatten into the enclosing skeleton — unless
    // they carry a vars block, which makes them their own evaluable unit
    if (node.kind === 'skeleton' && node.vars === undefined) {
      skeleton[key] = node.skeleton
      holes.push(...node.holes.map((hole) => ({ ...hole, at: [key, ...hole.at] })))
      continue
    }
    holes.push({ path: node.path, at: [key], node })
  }

  if (holes.length === 0) {
    if (vars !== undefined && Object.keys(vars).length > 0) {
      // Nothing evaluable in scope — the block is unreferenced by
      // construction; warn now, then fold (lazy vars never evaluate)
      emit(
        state,
        'warning',
        ErrorCodes.unreferencedVar,
        'this vars block declares names nothing in its scope references',
        [...path, 'vars'],
        order
      )
    }
    return constant(changed || vars !== undefined ? skeleton : raw, path, order)
  }

  const node: SkeletonNode = { kind: 'skeleton', skeleton, holes, path, order }
  if (vars !== undefined) node.vars = vars
  return node
}

// ── Artifact-level holes and shielding ──────────────────────────────

const rootHoles = (state: WalkState, root: CompiledNode): ArtifactHole[] => {
  if (root.kind === 'constant') return []
  // A plain-literal root shields per hole, each embedded expression
  // declaring its own static fallback (fallback rule 3). A `vars` block on
  // that root does not change the accounting: on a timeout no hole is
  // demanded, so no var is ever evaluated, and the constant skeleton
  // splices around the holes exactly as it would without one. The scope
  // itself stays on the root node, which is where evaluation reads it.
  if (root.kind === 'skeleton')
    return root.holes.map((hole) => ({
      path: hole.path,
      node: hole.node,
      ...withStaticFallback(state, hole.node),
    }))
  return [{ path: [], node: root, ...withStaticFallback(state, root) }]
}

const withStaticFallback = (
  state: WalkState,
  node: CompiledNode
): { staticFallback?: { value: unknown } } => {
  const fallback = staticFallbackFor(state, node)
  return fallback === undefined ? {} : { staticFallback: fallback }
}

/**
 * The shielding precompute (obligation B2): present iff the hole root's
 * fallback subtree is classified constant. An operatorDefaults modifier
 * fallback counts — which is exactly why `operatorDefaults` invalidates the
 * parse cache.
 */
const staticFallbackFor = (
  state: WalkState,
  node: CompiledNode
): { value: unknown } | undefined => {
  if (node.kind !== 'operator' && node.kind !== 'fragmentCall') return undefined
  if (node.fallback !== undefined)
    return node.fallback.kind === 'constant' ? { value: node.fallback.value } : undefined
  if (node.kind === 'operator') {
    const defaults = node.entry.instanceDefaults
    // The registry stores operatorDefaults fallbacks unclassified — the
    // shared probe answers constancy for them (src/parse/probe.ts)
    if (
      defaults !== undefined &&
      'fallback' in defaults &&
      probeConstant(defaults.fallback, state.registry, state.fragments).constant
    )
      return { value: defaults.fallback }
  }
  return undefined
}

/** Every invocable name — operators, aliases, fragments — for suggestions. */
const allInvocationNames = (state: WalkState): string[] => [
  ...state.registry.operators.keys(),
  ...state.registry.aliases.keys(),
  ...state.fragments.keys(),
]
