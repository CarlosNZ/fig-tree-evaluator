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
 * One scope concern lives here rather than in the check layer: iterator
 * `as` renaming. Renamed bindings (`$order`, `$orderIndex`) are
 * author-named reference strings, so *recognition* — and with it constancy
 * classification — depends on the enclosing `as` frames. `as` values are
 * structural (parse-time literals), which is what keeps this static.
 */
import { ErrorCodes } from '../errorCodes'
import type { Severity } from '../issues'
import { isPlainDataObject, nearestName } from '../utils'
import { resolveOperator, type OperatorRegistry, type RegistryEntry } from '../registry'
import { checkNameLegality } from '../names'
import { parseDrill, recognizeReference, renderSegments, splitSigilToken } from './references'
import type {
  ArtifactHole,
  CompiledNode,
  ConstantNode,
  FragmentCallNode,
  NodePath,
  OperatorNode,
  ParseArtifact,
  TemplateHole,
  TemplateNode,
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
  }
  const root = walk(state, input, [], 0)
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

// ── Issue emission ──────────────────────────────────────────────────

const emit = (
  state: WalkState,
  severity: Severity,
  code: string,
  message: string,
  path: NodePath,
  order: number,
  operator?: string
) => {
  state.issues.push({
    issue: {
      severity,
      code,
      message,
      path,
      ...(operator !== undefined ? { operator } : {}),
    },
    order,
  })
}

// ── The walk ────────────────────────────────────────────────────────

const walk = (state: WalkState, raw: unknown, path: NodePath, depth: number): CompiledNode => {
  const order = state.order++
  state.nodeCount++
  if (depth > state.maxDepth) state.maxDepth = depth

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
      emit(
        state,
        'warning',
        ErrorCodes.unrecognizedIdentifier,
        `'${raw}' matches no reference namespace and will pass through as data`,
        path,
        order
      )
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
  Object.keys(raw).filter((key) => {
    if (!key.startsWith('$')) return false
    const name = key.slice(1)
    return (
      name === 'literal' ||
      resolveOperator(state.registry, name) !== undefined ||
      state.fragments.has(name)
    )
  })

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
    node.params[entry.name] = walkPending(state, entry, depth)
  }
  if (frame !== undefined) state.renamedBindings.push(frame)
  for (const entry of pending) {
    if (!perElement.has(entry.name)) continue
    node.params[entry.name] = walkPending(state, entry, depth)
  }
  if (frame !== undefined) state.renamedBindings.pop()
}

const walkPending = (state: WalkState, entry: PendingParam, depth: number): CompiledNode => {
  if (entry.kind === 'value') return walk(state, entry.value, entry.path, depth + 1)
  const children = entry.elements.map((element, j) => ({
    key: j as string | number,
    rawChild: element === undefined ? null : element,
    node: walk(
      state,
      element === undefined ? null : element,
      [...entry.basePath, entry.offset + j],
      depth + 1
    ),
  }))
  const changed = entry.elements.some((element) => element === undefined)
  return assembleContainer(
    state,
    entry.elements,
    children,
    true,
    changed,
    undefined,
    entry.basePath,
    state.order++
  )
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
  if (rest !== null && payload.length > leading.length) {
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
  return assembleContainer(state, raw, entries, false, changed, vars, path, order)
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
  const holes: TemplateHole[] = []
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
    // Nested plain literals flatten into the enclosing template — unless
    // they carry a vars block, which makes them their own evaluable unit
    if (node.kind === 'template' && node.vars === undefined) {
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

  const template: TemplateNode = { kind: 'template', skeleton, holes, path, order }
  if (vars !== undefined) template.vars = vars
  return template
}

// ── Artifact-level holes and shielding ──────────────────────────────

const rootHoles = (state: WalkState, root: CompiledNode): ArtifactHole[] => {
  if (root.kind === 'constant') return []
  if (root.kind === 'template' && root.vars === undefined)
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
    if (defaults !== undefined && 'fallback' in defaults && isConstantValue(state, defaults.fallback))
      return { value: defaults.fallback }
  }
  return undefined
}

/**
 * Recognition-only constancy probe for raw (uncompiled) values — used on
 * `operatorDefaults` fallbacks, which the registry stores unclassified.
 */
const isConstantValue = (state: WalkState, value: unknown): boolean => {
  if (typeof value === 'string') {
    const kind = recognizeReference(value).kind
    return kind === 'plain' || kind === 'unrecognized'
  }
  if (Array.isArray(value)) return value.every((element) => isConstantValue(state, element))
  if (isPlainDataObject(value)) {
    if ('operator' in value || 'fragment' in value || 'vars' in value) return false
    if (recognizedShorthandKeys(state, value).length > 0) return false
    return Object.values(value).every((element) => isConstantValue(state, element))
  }
  return true
}

/** Every invocable name — operators, aliases, fragments — for suggestions. */
const allInvocationNames = (state: WalkState): string[] => [
  ...state.registry.operators.keys(),
  ...state.registry.aliases.keys(),
  ...state.fragments.keys(),
]
