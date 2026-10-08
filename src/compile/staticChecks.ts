/**
 * Chunk 3.3 — the metadata-driven static-check layer ("The check inventory"
 * in docs-dev/v3-specs/v3-evaluator-methods.md): a second compile-time pass
 * over the compiled AST. Constant subtrees are already collapsed, so this
 * pass is proportional to the evaluable structure, not the input size (the
 * two-pass ruling, Phase-3 plan).
 *
 * Everything here is option-independent — issues append to the artifact's
 * stored stream. The two option-dependent checks (maxDepth/maxNodes, the
 * sample-data warning) live in FigTree.validate(), which runs them per call
 * against the artifact's stored counts and dependency list.
 */
import { ErrorCodes } from '../errorCodes'
import { FALLBACK_ERROR_FIELDS } from '../FigTreeError'
import type { Issue, Severity } from '../issues'
import { checkDeclared, checkType, typeNamesNull } from '../typeCheck'
import { typesIntersect } from '../typeIntersection'
import { staticType } from './staticType'
import type { Constraints, ExpectedType } from '../typeCheck'
import type { EvaluationMode } from '../operatorDefinition'
import { nearestName } from '../utils'
import { validateHelpers } from './helpers'
import {
  bindsReference,
  extendPath,
  hasError,
  renamedBinding,
  sortIssues,
  toNodePath,
} from './artifact'
import type {
  CompiledNode,
  FragmentCallNode,
  LinkedPath,
  OperatorNode,
  CompileArtifact,
  ReferenceNode,
  StaticFallback,
} from './artifact'
import type { PathSegment } from '../primitives'

/**
 * Phase-11 hook: inside a fragment body, `$params` resolves against the
 * declared parameter names. Absent (every Phase-3 call), any `$params`
 * reference is an outside-a-body error.
 */
export interface StaticCheckContext {
  fragmentParams?: ReadonlySet<string>
}

interface VarEntry {
  node: CompiledNode
  declaredAt: LinkedPath
  order: number
  referenced: boolean
}

interface VarsFrame {
  names: Map<string, VarEntry>
  /** The var whose definition is being visited — cycle-edge source. */
  currentVar: string | null
  /** Same-block reference edges, source → targets. */
  edges: Map<string, Set<string>>
}

/** An iterator's binding scope: `as` name, or null for $element/$index. */
interface IteratorFrame {
  as: string | null
  /** Set when a reference inside the subtree resolved against this frame. */
  referenced: boolean
}

/** A fallback's subtree, where `$error` is the failure it caught. */
interface FallbackFrame {
  /** Set when an `$error` reference inside resolved against this frame. */
  referenced: boolean
}

interface CheckState {
  artifact: CompileArtifact
  context: StaticCheckContext
  varsFrames: VarsFrame[]
  iteratorFrames: IteratorFrame[]
  fallbackFrames: FallbackFrame[]
}

/**
 * Run the metadata-driven checks, appending to the artifact's issue stream
 * (sorted back into tree order and `hasErrors` refreshed before returning).
 */
export const runStaticChecks = (artifact: CompileArtifact, context: StaticCheckContext = {}) => {
  const state: CheckState = {
    artifact,
    context,
    varsFrames: [],
    iteratorFrames: [],
    fallbackFrames: [],
  }
  visit(state, artifact.root)
  sortIssues(artifact.issues)
  artifact.hasErrors = hasError(artifact.issues)
}

const emit = (
  state: CheckState,
  severity: Severity,
  code: string,
  message: string,
  path: LinkedPath,
  order: number,
  extra: { operator?: string; fragment?: string; parameter?: string; suggestion?: string } = {}
) => {
  const issue: Issue = { severity, code, message, path: toNodePath(path) }
  if (extra.operator !== undefined) issue.operator = extra.operator
  if (extra.fragment !== undefined) issue.fragment = extra.fragment
  if (extra.parameter !== undefined) issue.parameter = extra.parameter
  if (extra.suggestion !== undefined) issue.suggestion = extra.suggestion
  state.artifact.issues.push({ issue, order })
}

// ── The visit ───────────────────────────────────────────────────────

const visit = (state: CheckState, node: CompiledNode) => {
  switch (node.kind) {
    case 'constant':
    case 'invalid':
      return
    case 'reference':
      visitReference(state, node)
      return
    case 'skeleton': {
      const frame = pushVars(state, node.vars, node.path)
      for (const hole of node.holes) visit(state, hole.node)
      popVars(state, frame)
      return
    }
    case 'fragmentCall':
      visitFragmentCall(state, node)
      return
    case 'elements':
      for (const element of node.nodes) visit(state, element)
      return
    case 'entries': {
      const frame = pushVars(state, node.vars, node.path)
      for (const key in node.entries) visit(state, node.entries[key])
      popVars(state, frame)
      return
    }
    case 'operator':
      visitOperator(state, node)
      return
  }
  // Exhaustive by construction: a new node kind must say how it is
  // traversed. `visit` is the only resolver of $vars / $params / $element /
  // $index and the only builder of the vars cycle graph, so a kind that
  // slips through loses scope checking silently — and a cycle routed
  // through it hangs at runtime instead of failing validation.
  return node satisfies never
}

/**
 * A node's fallback, under a frame of its own: `$error` inside resolves to
 * the innermost one, so a fallback inside a fallback rebinds it. Its node
 * pushed its vars first, and their definitions were visited then, outside
 * this frame — they feed the node's parameters too, which run before
 * anything has failed.
 *
 * A fallback that reads its own `$error` is marked on its node, which the
 * runtime reads: such a fallback never fails, its node giving `null`
 * instead.
 */
const visitFallback = (
  state: CheckState,
  owner: OperatorNode | FragmentCallNode,
  fallback: CompiledNode
) => {
  const frame: FallbackFrame = { referenced: false }
  state.fallbackFrames.push(frame)
  visit(state, fallback)
  state.fallbackFrames.pop()
  if (frame.referenced) owner.fallbackReadsError = true
}

const isCompiledNode = (value: object): value is CompiledNode =>
  'kind' in value && typeof (value as { kind: unknown }).kind === 'string'

// ── Operator nodes: the metadata checks ─────────────────────────────

const visitOperator = (state: CheckState, node: OperatorNode) => {
  const frame = pushVars(state, node.vars, node.path)
  if (node.fallback !== undefined) visitFallback(state, node, node.fallback)

  const definition = node.entry.definition
  const owner = operatorOwner(node)
  for (const [name, declared] of definition.resolution.entries) {
    const supplied = node.params[name]
    if (supplied === undefined) {
      if (declared.required)
        emit(
          state,
          'error',
          ErrorCodes.missingRequired,
          `'${node.name}' requires '${name}'`,
          node.path,
          node.order,
          { operator: node.name, parameter: name }
        )
      continue
    }
    checkSuppliedParam(state, owner, name, declared, supplied, nullIsReplaced(node, name))
  }

  runValidateHook(state, node)

  // Binding scopes: exactly the perElement subtrees ("The binding scope is
  // exactly the each subtree" — batch 5). Everything else visits outside.
  const perElement: [string, CompiledNode][] = []
  for (const name in node.params) {
    const supplied = node.params[name]
    if (definition.parameters[name]?.evaluation === 'perElement') perElement.push([name, supplied])
    else visit(state, supplied)
  }
  if (perElement.length > 0) {
    const iterator: IteratorFrame = { as: renamedBinding(node), referenced: false }
    state.iteratorFrames.push(iterator)
    for (const [, supplied] of perElement) visit(state, supplied)
    state.iteratorFrames.pop()
    // The dead-binding lint, sibling of the unreferenced-vars warning: an
    // `each` that reads none of its own bindings computes the same thing
    // for every element. Conceivable on purpose, almost always a mistyped
    // reference or a payload nested one level off
    if (!iterator.referenced)
      emit(
        state,
        'warning',
        ErrorCodes.deadBinding,
        `'${node.name}' binds ${iterator.as === null ? '$element / $index' : `$${iterator.as}`} but its 'each' references neither`,
        node.path,
        node.order,
        { operator: node.name }
      )
  }

  popVars(state, frame)
}

/**
 * Whether a whole null at `target` is replaced before the type check sees
 * it: a `replacesNullAt` holder targets it, supplied on the node or by its
 * operator's `operatorDefaults`, the chain the runtime builds its holders
 * from (src/evaluate/params.ts). A null holder is unset, so it replaces
 * nothing. At a target declaring an element null policy the holder
 * replaces null elements only, and a whole null reaches the type check.
 */
const nullIsReplaced = (node: OperatorNode, target: string) => {
  const { definition, hostDefaults } = node.entry
  if (definition.parameters[target]?.elementNullPolicy !== undefined) return false
  for (const [name, declared] of definition.resolution.entries) {
    if (!declared.replacesNullAt?.includes(target)) continue
    const holder = node.params[name]
    if (holder === undefined) {
      const fromDefaults = hostDefaults !== undefined && Object.hasOwn(hostDefaults, name)
      if (fromDefaults && hostDefaults[name] !== null) return true
    } else if (!(holder.kind === 'constant' && holder.value === null)) return true
  }
  return false
}

/**
 * What a receiving position declares, as this layer reads it. An operator's
 * `ValidatedParameter` and a fragment's `FragmentParameter` both satisfy it
 * — the two declaration shapes share `TypeDeclaration`, which is what lets
 * one checker serve an operator parameter and a fragment argument alike.
 */
interface ReceivingDeclaration {
  type: ExpectedType
  required: boolean
  constraints?: Constraints
  elementNullPolicy?: unknown
  evaluation?: EvaluationMode
}

/**
 * Check a node supplied at a receiving position, then the chain of
 * fallbacks standing in for it there. `nullReplaced` says whether a
 * `replacesNullAt` holder replaces a whole null at the position (operator
 * parameters only — a fragment argument has no holders).
 */
const checkSuppliedParam = (
  state: CheckState,
  owner: { label: string; extra: { operator?: string; fragment?: string } },
  name: string,
  declared: ReceivingDeclaration,
  supplied: CompiledNode,
  nullReplaced = false
) => {
  // An element-addressable parameter has no whole value — not here and not
  // at runtime, since the engine never assembles one. Its arity is known
  // statically all the same, so the `length` constraint is checked against
  // the element count; `homogeneous` and `elementShape` need element values
  // and are checked per element as each is demanded (Phase 5.2).
  if (supplied.kind === 'elements') {
    const length = declared.constraints?.length
    if (length !== undefined && supplied.nodes.length !== length)
      emit(
        state,
        'error',
        ErrorCodes.typeCheck,
        `'${owner.label}.${name}': expected ${length} element${length === 1 ? '' : 's'}, received ${supplied.nodes.length}`,
        supplied.path,
        supplied.order,
        { ...owner.extra, parameter: name }
      )
    return
  }
  // 'as' is owned by the walk (invalid-as); other structural params must be
  // literal too
  if (supplied.kind !== 'constant' && declared.evaluation === 'structural' && name !== 'as') {
    emit(
      state,
      'error',
      ErrorCodes.typeCheck,
      `'${owner.label}.${name}' is structural — it requires a literal value`,
      supplied.path,
      supplied.order,
      { ...owner.extra, parameter: name }
    )
    return
  }
  const at = `'${owner.label}.${name}'`
  const mismatch = findMismatch(declared, supplied, nullReplaced)
  if (mismatch !== undefined)
    emit(
      state,
      'error',
      mismatch.code,
      mismatch.code === ErrorCodes.returnsMismatch
        ? `${mismatch.reason} — it can never satisfy ${at}`
        : `${at}: ${mismatch.reason}`,
      supplied.path,
      supplied.order,
      { ...owner.extra, parameter: name }
    )

  // A fallback stands in for its node's value at the same position, so it
  // is checked against the same declaration, and so is its own fallback,
  // to the end of the chain. A mismatch is a warning: it breaks only the
  // failure path, and the expression still runs
  let node: CompiledNode = supplied
  while (node.kind === 'operator' || node.kind === 'fragmentCall') {
    const fallback: CompiledNode | undefined = node.fallback
    if (fallback === undefined) {
      if (node.kind === 'operator')
        checkInstanceFallback(state, owner, name, declared, node, nullReplaced)
      return
    }
    const unfit = findMismatch(declared, fallback, nullReplaced)
    if (unfit !== undefined)
      emit(
        state,
        'warning',
        ErrorCodes.fallbackMismatch,
        `this fallback can never satisfy ${at}: ${unfit.reason}`,
        fallback.path,
        fallback.order,
        { ...owner.extra, parameter: name }
      )
    node = fallback
  }
}

/**
 * An operator node with no fallback of its own falls back to its operator's
 * instance-wide one from `operatorDefaults`, which is static: the runtime
 * fills it in, never evaluating it (src/evaluate/operator.ts). It has no
 * place in the expression, so a mismatch is reported on the node.
 */
const checkInstanceFallback = (
  state: CheckState,
  owner: { label: string; extra: { operator?: string; fragment?: string } },
  name: string,
  declared: ReceivingDeclaration,
  node: OperatorNode,
  nullReplaced: boolean
) => {
  const fallback = node.entry.defaultFallback
  if (fallback === undefined) return
  const unfit = staticMismatch(declared, fallback, nullReplaced)
  if (unfit !== undefined)
    emit(
      state,
      'warning',
      ErrorCodes.fallbackMismatch,
      `'${node.name}' falls back to its operatorDefaults fallback, which can never satisfy '${owner.label}.${name}': ${unfit.reason}`,
      node.path,
      node.order,
      { ...owner.extra, parameter: name }
    )
}

/**
 * Why a value-producing node can never satisfy a receiving declaration, or
 * undefined when it can, or when nothing is known before it runs (a
 * reference, but for what `$error` is known to hold, or a call to an
 * unknown fragment). It serves the node supplied at a position and each
 * fallback standing in for it there alike.
 */
const findMismatch = (
  declared: ReceivingDeclaration,
  node: CompiledNode,
  nullReplaced: boolean
): { code: string; reason: string } | undefined => {
  switch (node.kind) {
    case 'constant':
      return valueMismatch(declared, node.value, nullReplaced)
    // The returns feeding-position check: an operator node or fragment call
    // whose returns cannot intersect the receiving type. A call to an
    // unknown fragment has its own error, and no type
    case 'operator':
    case 'fragmentCall': {
      if (node.kind === 'fragmentCall' && node.entry === undefined) return
      const returns = staticType(node)
      if (typesIntersect(returns, declared.type)) return
      const what = node.kind === 'operator' ? `'${node.name}'` : `fragment '${node.name}'`
      return {
        code: ErrorCodes.returnsMismatch,
        reason: `${what} returns ${JSON.stringify(returns)}`,
      }
    }
    // A container holding something computed is still an array or an
    // object, so it is checked as a literal one would be, with the same
    // message
    case 'skeleton':
      return sampleMismatch(declared, Array.isArray(node.skeleton) ? [] : {})
    case 'reference':
      return node.namespace === 'error' ? readMismatch(declared, node.segments) : undefined
    default:
      return
  }
}

/**
 * Why a static fallback can never satisfy a receiving declaration, checked
 * as `findMismatch` checks the compiled form it stands for: a constant by
 * its value, a read of `$error` by what that holds, and plain data around
 * reads by whether it is an array or an object.
 */
const staticMismatch = (
  declared: ReceivingDeclaration,
  { value, reads }: StaticFallback,
  nullReplaced: boolean
): { code: string; reason: string } | undefined => {
  if (reads === undefined) return valueMismatch(declared, value, nullReplaced)
  if (reads[0].at.length === 0) return readMismatch(declared, reads[0].segments)
  return sampleMismatch(declared, Array.isArray(value) ? [] : {})
}

/** Why what a read of `$error` holds can never satisfy the declaration. */
const readMismatch = (
  declared: ReceivingDeclaration,
  segments: PathSegment[]
): { code: string; reason: string } | undefined => {
  const type = errorReadType(segments)
  if (type === undefined || typesIntersect(type, declared.type)) return
  return sampleMismatch(declared, SAMPLES[type])
}

/** Why a value of this one's type can never satisfy the declaration. */
const sampleMismatch = (
  declared: ReceivingDeclaration,
  sample: unknown
): { code: string; reason: string } | undefined => {
  const typed = checkType(sample, declared.type)
  if (!typed.ok)
    return {
      code: ErrorCodes.typeCheck,
      reason: `expected ${typed.expected}, received ${typed.actual}`,
    }
  return
}

/** A value of each type an `$error` read can be known to have. */
const SAMPLES = { object: {}, array: [], string: '', number: 0, boolean: false }

/**
 * The type an `$error` read is known to have: a bare `$error` is always an
 * object, and a field is its type in `FallbackError`'s shape where that is
 * one type. Anything else is unknown. An optional field may be absent, so
 * read as null, which an optional parameter may take as unset.
 */
const errorReadType = (segments: PathSegment[]): keyof typeof SAMPLES | undefined => {
  const [field, ...rest] = segments
  if (field === undefined) return 'object'
  if (rest.length > 0 || !Object.hasOwn(FALLBACK_ERROR_FIELDS, field)) return undefined
  const type = FALLBACK_ERROR_FIELDS[field as keyof typeof FALLBACK_ERROR_FIELDS]
  return typeof type === 'string' ? type : undefined
}

/**
 * Why a value can never satisfy a receiving declaration — the compile
 * moment of the one type table. Null policy runs BEFORE the type check,
 * mirroring the runtime layers: a null that a holder replaces, or a null at
 * an optional parameter whose type excludes null (unset, so the default
 * applies), never reaches the type check. Past it, the constraints follow
 * the rule every other check of a value follows (`checkDeclared`).
 */
const valueMismatch = (
  declared: ReceivingDeclaration,
  value: unknown,
  nullReplaced: boolean
): { code: string; reason: string } | undefined => {
  if (value === null && (nullReplaced || (!declared.required && !typeNamesNull(declared.type))))
    return
  const checked = checkDeclared(value, declared)
  if (!checked.ok)
    return {
      code: ErrorCodes.typeCheck,
      reason: `expected ${checked.expected}, received ${checked.actual}`,
    }
  return
}

const operatorOwner = (node: OperatorNode) => ({
  label: node.name,
  extra: { operator: node.name },
})

// ── Fragment calls: the call signature ──────────────────────────────

/**
 * Static mode gets the full signature check — a missing required argument
 * or an unknown argument name is a typo the author can fix before running
 * anything, which is the same posture the no-hoisting rule takes on an
 * operator node.
 *
 * Dynamic mode gets none of it: the arguments object does not exist until
 * evaluation, so the identical checks move to the call itself. What is
 * checked here in one mode and there in the other is deliberately the same
 * list.
 */
const visitFragmentCall = (state: CheckState, node: FragmentCallNode) => {
  const frame = pushVars(state, node.vars, node.path)
  if (node.fallback !== undefined) visitFallback(state, node, node.fallback)

  const declarations = node.entry?.parameters
  const supplied =
    node.parameters !== undefined && !isCompiledNode(node.parameters) ? node.parameters : undefined

  // An unregistered name already raised unknown-fragment; there is nothing
  // to check a call against
  if (declarations !== undefined && node.argumentsMode === 'static') {
    const owner = { label: node.name, extra: { fragment: node.name } }
    for (const name in declarations) {
      const declared = declarations[name]
      const argument = supplied?.[name]
      if (argument === undefined) {
        if (declared.required)
          emit(
            state,
            'error',
            ErrorCodes.missingRequired,
            `fragment '${node.name}' – requires '${name}'`,
            node.path,
            node.order,
            { fragment: node.name, parameter: name }
          )
        continue
      }
      checkSuppliedParam(state, owner, name, declared, argument)
    }
    if (supplied !== undefined)
      for (const name in supplied) {
        const argument = supplied[name]
        if (declarations[name] === undefined) {
          const suggestion = nearestName(name, Object.keys(declarations))
          emit(
            state,
            'error',
            ErrorCodes.unknownNodeKey,
            `fragment '${node.name}' declares no parameter '${name}'${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
            argument.path,
            argument.order,
            { parameter: name, suggestion }
          )
        }
      }
  }

  if (node.parameters !== undefined) {
    if (isCompiledNode(node.parameters)) visit(state, node.parameters)
    else for (const key in node.parameters) visit(state, node.parameters[key])
  }
  popVars(state, frame)
}

// ── The operator validate hook (contract ledger #11) ────────────────

const runValidateHook = (state: CheckState, node: OperatorNode) => {
  const hook = node.entry.definition.validate
  if (hook === undefined) return

  // Literal parameter values only — dynamic values simply aren't present
  const literalParams: Record<string, unknown> = {}
  for (const name in node.params) {
    const supplied = node.params[name]
    if (supplied.kind === 'constant') literalParams[name] = supplied.value
  }

  let findings: ReturnType<typeof hook>
  try {
    findings = hook(literalParams, validateHelpers)
  } catch (error) {
    emit(
      state,
      'error',
      ErrorCodes.operatorValidate,
      `'${node.name}' validate hook threw: ${(error as Error).message}`,
      node.path,
      node.order,
      { operator: node.name }
    )
    return
  }
  for (const finding of findings) {
    const target = finding.parameter !== undefined ? node.params[finding.parameter] : undefined
    emit(
      state,
      finding.severity,
      ErrorCodes.operatorValidate,
      finding.message,
      target?.path ?? node.path,
      node.order,
      {
        operator: node.name,
        ...(finding.parameter !== undefined ? { parameter: finding.parameter } : {}),
      }
    )
  }
}

// ── References: scope resolution ────────────────────────────────────

const visitReference = (state: CheckState, node: ReferenceNode) => {
  const { namespace } = node
  switch (namespace) {
    case 'data':
      return
    case 'vars':
      resolveVar(state, node)
      return
    case 'params':
      resolveParam(state, node)
      return
    case 'element':
    case 'index':
      resolveBinding(state, node, namespace)
      return
    case 'error':
      resolveError(state, node)
      return
  }
  // Exhaustive by construction: a namespace missing here would skip its
  // scope check silently
  return namespace satisfies never
}

const resolveVar = (state: CheckState, node: ReferenceNode) => {
  const first = node.segments[0]
  const name = typeof first === 'string' ? first : undefined
  if (name !== undefined) {
    for (let i = state.varsFrames.length - 1; i >= 0; i--) {
      const frame = state.varsFrames[i]
      const entry = frame.names.get(name)
      if (entry !== undefined) {
        entry.referenced = true
        // A reference landing on the block currently defining a var is a
        // same-block dependency edge — the cycle-detection graph
        if (frame.currentVar !== null) {
          const targets = frame.edges.get(frame.currentVar) ?? new Set()
          targets.add(name)
          frame.edges.set(frame.currentVar, targets)
        }
        return
      }
    }
  }
  emit(
    state,
    'error',
    ErrorCodes.unresolvedVar,
    `'${node.raw}': no var '${name ?? ''}' is declared in scope`,
    node.path,
    node.order
  )
}

const resolveParam = (state: CheckState, node: ReferenceNode) => {
  const declared = state.context.fragmentParams
  if (declared === undefined) {
    emit(
      state,
      'error',
      ErrorCodes.unresolvedParam,
      `'${node.raw}': $params is only available inside a fragment body`,
      node.path,
      node.order
    )
    return
  }
  // Bare `$params` is the declared parameters resolved — legal, because
  // the set it names is declared, finite and local
  if (node.segments.length === 0) return
  const first = node.segments[0]
  if (typeof first !== 'string' || !declared.has(first))
    emit(
      state,
      'error',
      ErrorCodes.unresolvedParam,
      `'${node.raw}': the fragment declares no parameter '${String(first)}'`,
      node.path,
      node.order
    )
}

/**
 * $element/$index (or an as-renamed pair) resolve lexically: the innermost
 * iterator frame binding the name used. A renamed frame does not bind the
 * default names ("one way to refer to each thing").
 */
const resolveBinding = (state: CheckState, node: ReferenceNode, namespace: 'element' | 'index') => {
  for (let i = state.iteratorFrames.length - 1; i >= 0; i--) {
    const frame = state.iteratorFrames[i]
    if (bindsReference(frame.as, namespace, node.binding)) {
      frame.referenced = true
      return
    }
  }
  if (node.scopeUnknown) return
  emit(
    state,
    'error',
    ErrorCodes.unresolvedBinding,
    `'${node.raw}' resolves against no enclosing iterator here`,
    node.path,
    node.order
  )
}

/** `$error` resolves to the innermost enclosing fallback's catch. */
const resolveError = (state: CheckState, node: ReferenceNode) => {
  const frame = state.fallbackFrames.at(-1)
  if (frame !== undefined) {
    frame.referenced = true
    return
  }
  if (node.scopeUnknown) return
  emit(
    state,
    'error',
    ErrorCodes.unresolvedBinding,
    `'${node.raw}' is only available inside the fallback of an operator node or fragment call`,
    node.path,
    node.order
  )
}

// ── vars frames: shadowing, unreferenced, cycles ────────────────────

const pushVars = (
  state: CheckState,
  vars: Record<string, CompiledNode> | undefined,
  holderPath: LinkedPath
): VarsFrame | null => {
  if (vars === undefined) return null
  const frame: VarsFrame = { names: new Map(), currentVar: null, edges: new Map() }

  const varsPath = extendPath(holderPath, 'vars')
  for (const name in vars) {
    const node = vars[name]
    const declaredAt = extendPath(varsPath, name)
    for (const outer of state.varsFrames) {
      if (outer.names.has(name)) {
        emit(
          state,
          'warning',
          ErrorCodes.shadowedVar,
          `'${name}' shadows a var of the same name from an enclosing scope`,
          declaredAt,
          node.order
        )
        break
      }
    }
    frame.names.set(name, {
      node,
      declaredAt,
      order: node.order,
      referenced: false,
    })
  }

  state.varsFrames.push(frame)
  // Var definitions may reference same-block or outer vars — visited with
  // the frame active, tracking the defining var for cycle edges
  for (const [name, entry] of frame.names) {
    frame.currentVar = name
    visit(state, entry.node)
    frame.currentVar = null
  }
  return frame
}

const popVars = (state: CheckState, frame: VarsFrame | null) => {
  if (frame === null) return
  state.varsFrames.pop()

  for (const [name, entry] of frame.names) {
    if (!entry.referenced)
      emit(
        state,
        'warning',
        ErrorCodes.unreferencedVar,
        `'${name}' is declared but never referenced in its scope`,
        entry.declaredAt,
        entry.order
      )
  }
  detectCycles(state, frame)
}

const detectCycles = (state: CheckState, frame: VarsFrame) => {
  // Each cycle is reported once, on its member declared first, naming the
  // others. A var that only leads into a cycle is not a member and gets no
  // issue: the issue's path is where the dependency has to be broken.
  const declarationIndex = new Map([...frame.names.keys()].map((name, i) => [name, i]))
  const stack: string[] = []
  const visiting = new Set<string>()
  const done = new Set<string>()
  const reported = new Set<string>()

  const report = (members: string[]) => {
    const ordered = [...members].sort((a, b) => declarationIndex.get(a)! - declarationIndex.get(b)!)
    const key = ordered.join('\0')
    if (reported.has(key)) return
    reported.add(key)
    const quoted = ordered.map((name) => `'${name}'`)
    const message =
      quoted.length === 1
        ? `${quoted[0]} depends on itself`
        : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]} form a vars cycle — a var may not depend on itself`
    const entry = frame.names.get(ordered[0])!
    emit(state, 'error', ErrorCodes.varCycle, message, entry.declaredAt, entry.order)
  }

  const dfs = (name: string) => {
    if (done.has(name)) return
    if (visiting.has(name)) {
      // A back edge: the stack from this var onward is exactly the cycle
      report(stack.slice(stack.indexOf(name)))
      return
    }
    visiting.add(name)
    stack.push(name)
    for (const target of frame.edges.get(name) ?? []) dfs(target)
    stack.pop()
    visiting.delete(name)
    done.add(name)
  }

  for (const name of frame.names.keys()) dfs(name)
}
