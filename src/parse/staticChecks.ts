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
import { checkType, checkConstraints, typesIntersect } from '../typeCheck'
import type { ValidatedParameter } from '../operatorDefinition'
import { validateHelpers } from './helpers'
import type {
  CompiledNode,
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
  extra: { operator?: string; parameter?: string } = {}
) => {
  const issue: Issue = { severity, code, message, path }
  if (extra.operator !== undefined) issue.operator = extra.operator
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
    case 'template': {
      const frame = pushVars(state, node.vars, node.path)
      for (const hole of node.holes) visit(state, hole.node)
      popVars(state, frame)
      return
    }
    case 'fragmentCall': {
      const frame = pushVars(state, node.vars, node.path)
      if (node.fallback !== undefined) visit(state, node.fallback)
      if (node.parameters !== undefined) {
        if (isCompiledNode(node.parameters)) visit(state, node.parameters)
        else for (const argument of Object.values(node.parameters)) visit(state, argument)
      }
      popVars(state, frame)
      return
    }
    case 'operator':
      visitOperator(state, node)
      return
  }
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
    checkSuppliedParam(state, node, name, declared, supplied)
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
    state.iteratorFrames.push({ as: renamedBinding(node) })
    for (const [, supplied] of perElement) visit(state, supplied)
    state.iteratorFrames.pop()
  }

  popVars(state, frame)
}

/** The literal `as` name on this node, when declared and usable. */
const renamedBinding = (node: OperatorNode): string | null => {
  const declared = node.entry.definition.parameters.as
  if (declared?.evaluation !== 'structural') return null
  const supplied = node.params.as
  if (supplied?.kind === 'constant' && typeof supplied.value === 'string') return supplied.value
  return null
}

const checkSuppliedParam = (
  state: CheckState,
  node: OperatorNode,
  name: string,
  declared: ValidatedParameter,
  supplied: CompiledNode
) => {
  // Literal values: the parse moment of the one type table. 'as' is owned
  // by the walk (invalid-as); other structural params must be literal too.
  if (supplied.kind === 'constant') {
    const typed = checkType(supplied.value, declared.type)
    if (!typed.ok) {
      emit(
        state,
        'error',
        ErrorCodes.typeCheck,
        `'${node.name}.${name}': expected ${typed.expected}, received ${typed.actual}`,
        supplied.path,
        supplied.order,
        { operator: node.name, parameter: name }
      )
      return
    }
    if (declared.constraints !== undefined) {
      const constrained = checkConstraints(supplied.value, declared.constraints)
      if (!constrained.ok)
        emit(
          state,
          'error',
          ErrorCodes.typeCheck,
          `'${node.name}.${name}': expected ${constrained.expected}, received ${constrained.actual}`,
          supplied.path,
          supplied.order,
          { operator: node.name, parameter: name }
        )
    }
    return
  }
  if (declared.evaluation === 'structural' && name !== 'as') {
    emit(
      state,
      'error',
      ErrorCodes.typeCheck,
      `'${node.name}.${name}' is structural — it requires a literal value`,
      supplied.path,
      supplied.order,
      { operator: node.name, parameter: name }
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
        `'${supplied.name}' returns ${JSON.stringify(returns)} — it can never satisfy '${node.name}.${name}'`,
        supplied.path,
        supplied.order,
        { operator: node.name, parameter: name }
      )
  }
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
      resolveBinding(state, node)
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
const resolveBinding = (state: CheckState, node: ReferenceNode) => {
  const matches = (frame: IteratorFrame): boolean => {
    if (node.binding === undefined) return frame.as === null
    return node.namespace === 'element'
      ? frame.as === node.binding
      : `${frame.as ?? ''}Index` === node.binding
  }
  for (let i = state.iteratorFrames.length - 1; i >= 0; i--) {
    if (matches(state.iteratorFrames[i])) return
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
