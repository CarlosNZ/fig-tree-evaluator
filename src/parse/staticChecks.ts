/**
 * Chunk 3.3 — the metadata-driven static-check layer ("The check inventory"
 * in docs-dev/v3-specs/v3-evaluator-methods.md): a second parse-time pass
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
import type { Issue, Severity } from '../issues'
import { checkType, checkConstraintsUnderPolicy, typesIntersect, typeNamesNull } from '../typeCheck'
import type { Constraints, ExpectedType } from '../typeCheck'
import type { EvaluationMode } from '../operatorDefinition'
import { nearestName } from '../utils'
import { validateHelpers } from './helpers'
import { bindsReference, renamedBinding } from './artifact'
import type {
  CompiledNode,
  FragmentCallNode,
  NodePath,
  OperatorNode,
  ParseArtifact,
  ReferenceNode,
} from './artifact'

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
  declaredAt: NodePath
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

interface CheckState {
  artifact: ParseArtifact
  context: StaticCheckContext
  varsFrames: VarsFrame[]
  iteratorFrames: IteratorFrame[]
}

/**
 * Run the metadata-driven checks, appending to the artifact's issue stream
 * (re-sorted into tree order before returning).
 */
export const runStaticChecks = (artifact: ParseArtifact, context: StaticCheckContext = {}) => {
  const state: CheckState = { artifact, context, varsFrames: [], iteratorFrames: [] }
  visit(state, artifact.root)
  artifact.issues.sort((a, b) => a.order - b.order)
}

const emit = (
  state: CheckState,
  severity: Severity,
  code: string,
  message: string,
  path: NodePath,
  order: number,
  extra: { operator?: string; fragment?: string; parameter?: string } = {}
) => {
  const issue: Issue = { severity, code, message, path }
  if (extra.operator !== undefined) issue.operator = extra.operator
  if (extra.fragment !== undefined) issue.fragment = extra.fragment
  if (extra.parameter !== undefined) issue.parameter = extra.parameter
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
      for (const value of Object.values(node.entries)) visit(state, value)
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

const isCompiledNode = (value: object): value is CompiledNode =>
  'kind' in value && typeof (value as { kind: unknown }).kind === 'string'

// ── Operator nodes: the metadata checks ─────────────────────────────

const visitOperator = (state: CheckState, node: OperatorNode) => {
  const frame = pushVars(state, node.vars, node.path)
  if (node.fallback !== undefined) visit(state, node.fallback)

  const definition = node.entry.definition
  for (const [name, declared] of Object.entries(definition.parameters)) {
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
    checkSuppliedParam(state, operatorOwner(node), name, declared, supplied)
  }

  runValidateHook(state, node)

  // Binding scopes: exactly the perElement subtrees ("The binding scope is
  // exactly the each subtree" — batch 5). Everything else visits outside.
  const perElement: [string, CompiledNode][] = []
  for (const [name, supplied] of Object.entries(node.params)) {
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

const checkSuppliedParam = (
  state: CheckState,
  owner: { label: string; extra: { operator?: string; fragment?: string } },
  name: string,
  declared: ReceivingDeclaration,
  supplied: CompiledNode
) => {
  // Literal values: the parse moment of the one type table. 'as' is owned
  // by the walk (invalid-as); other structural params must be literal too.
  // Null policy runs BEFORE the type check, mirroring the runtime layers:
  // a null at an optional parameter whose type excludes null is unset (the
  // default applies), and null elements under a declared elementNullPolicy
  // are the policy's business, not the constraints'.
  if (supplied.kind === 'constant') {
    if (supplied.value === null && !declared.required && !typeNamesNull(declared.type)) return
    const typed = checkType(supplied.value, declared.type)
    if (!typed.ok) {
      emit(
        state,
        'error',
        ErrorCodes.typeCheck,
        `'${owner.label}.${name}': expected ${typed.expected}, received ${typed.actual}`,
        supplied.path,
        supplied.order,
        { ...owner.extra, parameter: name }
      )
      return
    }
    if (declared.constraints !== undefined) {
      const constrained = checkConstraintsUnderPolicy(
        supplied.value,
        declared.constraints,
        declared.elementNullPolicy !== undefined
      )
      if (!constrained.ok)
        emit(
          state,
          'error',
          ErrorCodes.typeCheck,
          `'${owner.label}.${name}': expected ${constrained.expected}, received ${constrained.actual}`,
          supplied.path,
          supplied.order,
          { ...owner.extra, parameter: name }
        )
    }
    return
  }
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
  if (declared.evaluation === 'structural' && name !== 'as') {
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
  // The returns feeding-position check: a node in a parameter position
  // whose declared returns cannot intersect the receiving type
  if (supplied.kind === 'operator') {
    const returns = supplied.entry.definition.returns
    if (!typesIntersect(returns, declared.type))
      emit(
        state,
        'error',
        ErrorCodes.returnsMismatch,
        `'${supplied.name}' returns ${JSON.stringify(returns)} — it can never satisfy '${owner.label}.${name}'`,
        supplied.path,
        supplied.order,
        { ...owner.extra, parameter: name }
      )
  }
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
  if (node.fallback !== undefined) visit(state, node.fallback)

  const declarations = node.entry?.parameters
  const supplied =
    node.parameters !== undefined && !isCompiledNode(node.parameters) ? node.parameters : undefined

  // An unregistered name already raised unknown-fragment; there is nothing
  // to check a call against
  if (declarations !== undefined && node.argumentsMode === 'static') {
    const owner = { label: node.name, extra: { fragment: node.name } }
    for (const [name, declared] of Object.entries(declarations)) {
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
    for (const [name, argument] of Object.entries(supplied ?? {}))
      if (declarations[name] === undefined) {
        const suggestion = nearestName(name, Object.keys(declarations))
        emit(
          state,
          'error',
          ErrorCodes.unknownNodeKey,
          `fragment '${node.name}' declares no parameter '${name}'${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
          argument.path,
          argument.order,
          { parameter: name }
        )
      }
  }

  if (node.parameters !== undefined) {
    if (isCompiledNode(node.parameters)) visit(state, node.parameters)
    else for (const argument of Object.values(node.parameters)) visit(state, argument)
  }
  popVars(state, frame)
}

// ── The operator validate hook (contract ledger #11) ────────────────

const runValidateHook = (state: CheckState, node: OperatorNode) => {
  const hook = node.entry.definition.validate
  if (hook === undefined) return

  // Literal parameter values only — dynamic values simply aren't present
  const literalParams: Record<string, unknown> = {}
  for (const [name, supplied] of Object.entries(node.params)) {
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
    const target =
      finding.parameter !== undefined ? node.params[finding.parameter] : undefined
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
  switch (node.namespace) {
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
      resolveBinding(state, node, node.namespace)
      return
  }
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
const resolveBinding = (
  state: CheckState,
  node: ReferenceNode,
  namespace: 'element' | 'index'
) => {
  for (let i = state.iteratorFrames.length - 1; i >= 0; i--) {
    const frame = state.iteratorFrames[i]
    if (bindsReference(frame.as, namespace, node.binding)) {
      frame.referenced = true
      return
    }
  }
  emit(
    state,
    'error',
    ErrorCodes.unresolvedBinding,
    `'${node.raw}' resolves against no enclosing iterator here`,
    node.path,
    node.order
  )
}

// ── vars frames: shadowing, unreferenced, cycles ────────────────────

const pushVars = (
  state: CheckState,
  vars: Record<string, CompiledNode> | undefined,
  holderPath: NodePath
): VarsFrame | null => {
  if (vars === undefined) return null
  const frame: VarsFrame = { names: new Map(), currentVar: null, edges: new Map() }

  for (const [name, node] of Object.entries(vars)) {
    for (const outer of state.varsFrames) {
      if (outer.names.has(name)) {
        emit(
          state,
          'warning',
          ErrorCodes.shadowedVar,
          `'${name}' shadows a var of the same name from an enclosing scope`,
          [...holderPath, 'vars', name],
          node.order
        )
        break
      }
    }
    frame.names.set(name, {
      node,
      declaredAt: [...holderPath, 'vars', name],
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
  const visiting = new Set<string>()
  const done = new Set<string>()
  const reported = new Set<string>()

  const dfs = (name: string): boolean => {
    if (done.has(name)) return false
    if (visiting.has(name)) return true
    visiting.add(name)
    for (const target of frame.edges.get(name) ?? []) {
      if (dfs(target)) {
        visiting.delete(name)
        done.add(name)
        return true
      }
    }
    visiting.delete(name)
    done.add(name)
    return false
  }

  for (const name of frame.names.keys()) {
    if (done.has(name) || reported.has(name)) continue
    if (dfs(name)) {
      const entry = frame.names.get(name)!
      emit(
        state,
        'error',
        ErrorCodes.varCycle,
        `'${name}' participates in a vars cycle — a var may not depend on itself`,
        entry.declaredAt,
        entry.order
      )
      reported.add(name)
    }
  }
}
