/**
 * Fragment registration — the compile-once pipeline behind the `fragments`
 * option ("Fragments" in docs-dev/v3-specs/v3-api.md).
 *
 * A fragment is an expression registered under a name, with declared
 * parameters. Registration *is* its compile moment: `new FigTree()` and
 * `updateOptions()` throw on a bad fragment, so a call that registered can
 * only fail at runtime for data-dependent reasons. That posture is what
 * lets a call site splice a precompiled body and lets the static checker
 * resolve `$params` against a declaration set.
 *
 * Four passes, in this order for reasons that matter:
 *
 *  1. Shape, names and declarations — every entry exists, declarations
 *     filled, before any body compiles. That is what gives batch semantics:
 *     a body may call any fragment in the same batch regardless of key
 *     order, because the lookup it compiles against is already complete.
 *  2. Bodies — `compileExpression` over each `expression`, then each
 *     fragment's `returns` from its body's root, then `runStaticChecks` over
 *     each body, with the declared parameter names as the `$params` scope.
 *     The types come first so that a body feeding a call into a parameter
 *     is checked against the called fragment's type. Bodies
 *     compile in isolation, which is also where the sealing rules enforce
 *     themselves: a body referencing a caller's var or iterator binding has
 *     nothing to resolve against and fails HERE rather than surprising a
 *     call site.
 *  3. Cycles — recursion is banned, so a fragment transitively reaching
 *     itself is a registration error.
 *  4. Rollups, in reverse topological order (well-founded because pass 3
 *     proved a DAG): the transitive measurements a call site needs from its
 *     target, and the `noCache` checks, which read their targets' `caches`.
 *     A body's warnings are collected after this pass, so the cache
 *     checks' sit in tree order with the rest.
 *
 * Every fragment in the registry is always rebuilt together: a registry
 * change rebuilds from the merged options, so replacement re-validation and
 * operators-change re-validation are the same path as first registration,
 * with no special case. Nothing here is barrel surface except the two
 * authored types.
 */
import type { FragmentMetadata } from './catalogTypes'
import { ErrorCodes } from './errorCodes'
import type { Issue } from './issues'
import { checkNameLegality, isReservedRegistrationName, RESERVED_NODE_KEYS } from './names'
import {
  checkNoCache,
  composeRollups,
  compileExpression,
  runStaticChecks,
  splice,
  staticType,
  toNodePath,
  type ArtifactDependencies,
  type ArtifactHole,
  type CompiledNode,
  type ErrorRead,
  type NodePath,
  type CompileArtifact,
  type StaticFallback,
} from './compile'
import type { OperatorRegistry } from './registry'
import {
  checkDeclaredConstraints,
  checkType,
  isExpectedType,
  validateConstraintsShape,
  type Constraints,
  type ExpectedType,
  type TypeDeclaration,
} from './typeCheck'
import { findCycles, isPlainObject } from './utils'

/**
 * A fragment parameter declaration as authored. Extends the same
 * `TypeDeclaration` base an operator's `ParameterDeclaration` extends, so
 * one, less its `description`, is a valid operator parameter declaration:
 * `type`, `required` and `constraints` are inherited and mean exactly what
 * they mean for an operator parameter.
 *
 * `default` is a constant value, never an expression — visible to tooling
 * verbatim, type-checked here, never evaluated. A computed default is
 * written in the body over an optional-without-default parameter.
 */
export interface FragmentParameterDeclaration extends TypeDeclaration {
  default?: unknown
  description?: string
  /** Opaque tooling bag; the engine never reads it. */
  metadata?: Record<string, unknown>
}

/**
 * A fragment definition. The wrapper is mandatory even for a zero-parameter
 * fragment: a bare-expression form becomes ambiguous the moment the
 * expression itself holds an `expression` key, which is the camouflage trap
 * v2's in-expression `metadata` key was.
 */
export interface FragmentDefinition {
  /** Any expression — an operator node, a call, a reference, a constant. */
  expression: unknown
  /** Declarations, keyed by parameter name. */
  parameters?: Record<string, FragmentParameterDeclaration>
  description?: string
  /**
   * How the fragment is presented, which `getCatalog` reads, and any other
   * keys a host carries. The engine never reads it, and registration checks
   * only that it is a plain object.
   */
  metadata?: FragmentMetadata & Record<string, unknown>
  /**
   * Example argument values, keyed by parameter name, for authoring and
   * testing the fragment. Unlike a seed in `metadata`, which is what a new
   * call starts with, a sample is a realistic value to run the body with.
   * The engine never reads it.
   */
  samples?: { [parameter: string]: unknown }
}

/** A declaration after normalization — every documented default filled. */
export interface FragmentParameter {
  type: ExpectedType
  required: boolean
  default?: unknown
  description?: string
  metadata?: Record<string, unknown>
  constraints?: Constraints
}

/**
 * The compiled fragment: what the artifact holds by reference at a call
 * site and what the evaluator runs. The rollups are transitive — they
 * count *through* nested calls, by composition rules that differ because
 * the quantities do (see `composeRollups`, and `checkNoCache` for
 * `caches`).
 */
export interface FragmentEntry {
  name: string
  description?: string
  metadata?: FragmentMetadata & Record<string, unknown>
  parameters: Record<string, FragmentParameter>
  /** The compiled body. Assigned in pass 2; never reassigned after. */
  body: CompiledNode
  /**
   * What the body is known to return, read from its root (`staticType`):
   * what `getFragments()` reports, and what the feeding-position check
   * tests a call against. Inferred in pass 2, before any body's static
   * checks run, so a body calling another fragment is checked against it.
   */
  returns: ExpectedType
  /**
   * The body's warning-severity issues, kept here because a throw has no
   * channel for them. Reported by `getFragments()`, never replayed by a
   * calling expression's `validate()`: body errors were caught here and
   * cannot recur, and a body warning is not something a call site's author
   * can act on.
   */
  warnings: Issue[]
  /** Transitive evaluable-node count — a total, so a call site adds it. */
  nodeCount: number
  /** Transitive nesting, measured from this body's own root at 0. */
  maxDepth: number
  dependencies: ArtifactDependencies
  identityOnly: boolean
  /**
   * Whether a call can reach a node that caches: an operator node whose
   * definition declares `cache: true` and whose operator the host has not
   * turned off, or a call to a fragment that `caches`, with the body's own
   * `noCache` nodes respected. Folded in pass 4; what the dead-`noCache`
   * warning reads at a call, and what `getFragments()` reports.
   */
  caches: boolean
  /**
   * The body's static fallback, where every hole in it has one. A call node
   * with no `fallback` of its own lifts this for timeout shielding — without
   * the lift, factoring an expression into a fragment silently unshields it.
   */
  timeoutFallback?: StaticFallback
}

/** The declaration fields a fragment parameter may carry. */
const DECLARATION_KEYS = new Set([
  'type',
  'required',
  'default',
  'description',
  'metadata',
  'constraints',
])

/** The wrapper fields a fragment definition may carry. */
const DEFINITION_KEYS = new Set(['expression', 'parameters', 'description', 'metadata', 'samples'])

type AddIssue = (code: string, message: string, path: NodePath) => void

/**
 * Register every fragment into `registry.fragments`, reporting through the
 * caller's issue collector so a bad fragment joins the same aggregated
 * registration throw a bad operator does.
 *
 * `claim` is the registry's one-namespace collision domain: a fragment
 * sharing a name with an operator or an alias is refused, with no silent
 * precedence either way.
 */
export const registerFragments = (
  definitions: unknown,
  registry: OperatorRegistry,
  claim: (invocationName: string, path: NodePath) => boolean,
  addIssue: AddIssue
): void => {
  if (definitions === undefined) return
  if (!isPlainObject(definitions)) {
    addIssue(ErrorCodes.invalidOptions, "'fragments' must be a plain object", ['fragments'])
    return
  }

  // ── Pass 1: shape, names, declarations ────────────────────────────
  for (const [name, definition] of Object.entries(definitions)) {
    const entry = validateDefinition(name, definition, addIssue)
    if (entry === undefined) continue
    if (!claim(name, ['fragments', name])) continue
    registry.fragments.set(name, entry)
  }

  // ── Pass 2: bodies ────────────────────────────────────────────────
  // Every entry is in the lookup by now, so a body may call any fragment in
  // the batch. The composed measurements on these artifacts are not yet
  // meaningful — no target is folded before pass 4 — which is why the fold
  // composes from `artifact.own`, never from them.
  const compiled = new Map<string, CompileArtifact>()
  for (const [name, entry] of registry.fragments) {
    const definition = (definitions as Record<string, FragmentDefinition>)[name]
    const artifact = compileExpression(definition.expression, registry, {
      basePath: ['expression'],
    })
    entry.body = artifact.root
    compiled.set(name, artifact)
  }
  inferReturns(registry)
  for (const [name, entry] of registry.fragments) {
    const artifact = compiled.get(name)!
    runStaticChecks(artifact, { fragmentParams: new Set(Object.keys(entry.parameters)) })
    for (const { issue } of artifact.issues)
      if (issue.severity === 'error')
        addIssue(issue.code, `fragment '${name}': ${issue.message}`, [
          'fragments',
          name,
          ...issue.path,
        ])
  }

  // ── Pass 3: cycles ────────────────────────────────────────────────
  const acyclic = checkCycles(compiled, addIssue)

  // ── Pass 4: rollups ───────────────────────────────────────────────
  if (acyclic) foldRollups(registry, compiled)

  for (const [name, entry] of registry.fragments)
    for (const { issue } of compiled.get(name)!.issues)
      if (issue.severity !== 'error') {
        // Frozen, because `getFragments()` hands these out: the array is
        // copied per call, and a frozen issue is what makes the objects
        // inside it equally out of a caller's reach
        const frozen: Issue = { ...issue, path: [...issue.path] }
        Object.freeze(frozen.path)
        entry.warnings.push(Object.freeze(frozen))
      }
}

/**
 * The wrapper and its declarations. Returns the entry with its `body` slot
 * empty, or `undefined` where the definition cannot be registered at all.
 *
 * Stricter than `defineOperator()`, deliberately: unknown keys on the
 * wrapper and on a declaration are errors, because fragments are authored
 * by config authors rather than by the host developer, and a silently
 * ignored `defualt` is exactly the typo class v3 refuses everywhere else.
 */
const validateDefinition = (
  name: string,
  definition: unknown,
  addIssue: AddIssue
): FragmentEntry | undefined => {
  const at = (...rest: NodePath): NodePath => ['fragments', name, ...rest]
  const legality = checkNameLegality(name)
  if (!legality.ok) {
    addIssue(
      ErrorCodes.invalidName,
      `'${name}' is not a legal fragment name: ${legality.reason}`,
      at()
    )
    return undefined
  }
  if (isReservedRegistrationName(name)) {
    addIssue(
      ErrorCodes.reservedName,
      `'${name}' is a reserved name and may not name a fragment`,
      at()
    )
    return undefined
  }
  if (!isPlainObject(definition)) {
    addIssue(
      ErrorCodes.invalidDefinition,
      `fragment '${name}' must be a wrapper object: { expression, parameters?, description?, metadata?, samples? }`,
      at()
    )
    return undefined
  }
  if (!('expression' in definition)) {
    addIssue(ErrorCodes.invalidDefinition, `fragment '${name}' has no 'expression'`, at())
    return undefined
  }
  for (const key of Object.keys(definition))
    if (!DEFINITION_KEYS.has(key))
      addIssue(
        ErrorCodes.invalidDefinition,
        `'${key}' is not a key of a fragment definition`,
        at(key)
      )

  const entry: FragmentEntry = {
    name,
    parameters: {},
    // Replaced in pass 2 — an entry never escapes this module uncompiled
    body: { kind: 'constant', value: null, path: null, order: 0 },
    returns: 'any',
    warnings: [],
    nodeCount: 0,
    maxDepth: 0,
    dependencies: { dataPaths: new Map(), dynamic: false, operators: [], fragments: [] },
    identityOnly: false,
    caches: false,
  }
  if (definition.description !== undefined) {
    if (typeof definition.description !== 'string')
      addIssue(ErrorCodes.invalidDefinition, `'description' must be a string`, at('description'))
    else entry.description = definition.description
  }
  if (definition.metadata !== undefined) {
    if (!isPlainObject(definition.metadata))
      addIssue(ErrorCodes.invalidDefinition, `'metadata' must be a plain object`, at('metadata'))
    else entry.metadata = definition.metadata
  }
  if (definition.samples !== undefined && !isPlainObject(definition.samples))
    addIssue(ErrorCodes.invalidDefinition, `'samples' must be a plain object`, at('samples'))
  if (definition.parameters !== undefined) {
    if (!isPlainObject(definition.parameters))
      addIssue(
        ErrorCodes.invalidDefinition,
        `'parameters' must be a plain object`,
        at('parameters')
      )
    else
      for (const [parameter, declared] of Object.entries(definition.parameters)) {
        const normalized = validateDeclaration(parameter, declared, at, addIssue)
        if (normalized !== undefined) entry.parameters[parameter] = normalized
      }
  }
  return entry
}

/** One parameter declaration, normalized the way `defineOperator` does. */
const validateDeclaration = (
  parameter: string,
  declared: unknown,
  at: (...rest: NodePath) => NodePath,
  addIssue: AddIssue
): FragmentParameter | undefined => {
  const path = at('parameters', parameter)
  const legality = checkNameLegality(parameter)
  if (!legality.ok) {
    addIssue(
      ErrorCodes.invalidName,
      `'${parameter}' is not a legal parameter name: ${legality.reason}`,
      path
    )
    return undefined
  }
  // Flat reservation: a reserved node key is reserved everywhere, even
  // where it could not collide
  if (RESERVED_NODE_KEYS.has(parameter)) {
    addIssue(
      ErrorCodes.reservedName,
      `'${parameter}' is a reserved node key and may not name a parameter`,
      path
    )
    return undefined
  }
  if (!isPlainObject(declared)) {
    addIssue(
      ErrorCodes.invalidDefinition,
      `the declaration of '${parameter}' must be an object`,
      path
    )
    return undefined
  }
  for (const key of Object.keys(declared))
    if (!DECLARATION_KEYS.has(key))
      addIssue(ErrorCodes.invalidDefinition, `'${key}' is not a key of a parameter declaration`, [
        ...path,
        key,
      ])

  const type = declared.type ?? 'any'
  if (!isExpectedType(type)) {
    addIssue(ErrorCodes.invalidDefinition, `'${parameter}' declares an unknown type`, [
      ...path,
      'type',
    ])
    return undefined
  }
  if (declared.required !== undefined && typeof declared.required !== 'boolean') {
    addIssue(ErrorCodes.invalidDefinition, `'required' must be a boolean`, [...path, 'required'])
    return undefined
  }
  let constraints: Constraints | undefined
  if (declared.constraints !== undefined) {
    const shape = validateConstraintsShape(declared.constraints)
    if (!shape.ok) {
      addIssue(
        ErrorCodes.invalidDefinition,
        `'${parameter}' declares invalid constraints: expected ${shape.expected}, got ${shape.actual}`,
        [...path, 'constraints']
      )
      return undefined
    }
    constraints = declared.constraints as Constraints
  }

  const hasDefault = 'default' in declared
  // The default could never apply, so the pair can only be a mistake —
  // the same contradiction `operatorDefaults` validation refuses
  if (hasDefault && declared.required === true) {
    addIssue(
      ErrorCodes.invalidDefinition,
      `'${parameter}' is declared required and also declares a default — the default could never apply`,
      [...path, 'default']
    )
    return undefined
  }
  if (hasDefault) {
    const fit = checkType(declared.default, type)
    if (!fit.ok) {
      addIssue(
        ErrorCodes.typeCheck,
        `the default for '${parameter}' does not satisfy its declared type: expected ${fit.expected}, got ${fit.actual}`,
        [...path, 'default']
      )
      return undefined
    }
    const constrained = checkDeclaredConstraints(declared.default, { constraints })
    if (!constrained.ok) {
      addIssue(
        ErrorCodes.typeCheck,
        `the default for '${parameter}' violates its declared constraints: expected ${constrained.expected}, got ${constrained.actual}`,
        [...path, 'default']
      )
      return undefined
    }
  }

  const normalized: FragmentParameter = {
    type,
    // A default implies optional; an explicit `required` wins where given
    required: (declared.required as boolean | undefined) ?? !hasDefault,
  }
  if (hasDefault) normalized.default = declared.default
  if (typeof declared.description === 'string') normalized.description = declared.description
  if (isPlainObject(declared.metadata)) normalized.metadata = declared.metadata
  if (constraints !== undefined) normalized.constraints = constraints
  return normalized
}

/**
 * Each fragment's `returns`, from its body's root. A root that calls
 * another fragment takes that fragment's type, so the called one is
 * inferred first. A cycle is pass 3's error to report; here it is only
 * where the recursion stops, leaving `any`.
 */
const inferReturns = (registry: OperatorRegistry) => {
  const visiting = new Set<string>()
  const done = new Set<string>()
  const infer = (entry: FragmentEntry) => {
    if (done.has(entry.name) || visiting.has(entry.name)) return
    visiting.add(entry.name)
    const root = entry.body
    if (root.kind === 'fragmentCall' && root.entry !== undefined) infer(root.entry)
    entry.returns = staticType(root)
    visiting.delete(entry.name)
    done.add(entry.name)
  }
  for (const entry of registry.fragments.values()) infer(entry)
}

/**
 * Recursion is banned, so any fragment transitively reaching itself is a
 * registration error — guarded recursion included. Returns whether the
 * graph is acyclic, which is what makes the rollup fold well-founded.
 */
const checkCycles = (compiled: Map<string, CompileArtifact>, addIssue: AddIssue): boolean =>
  findCycles(
    compiled.keys(),
    (name) => compiled.get(name)?.fragmentCalls.map((call) => call.name),
    ([name, ...rest]) =>
      addIssue(
        ErrorCodes.fragmentCycle,
        `fragment '${name}' reaches itself: ${[name, ...rest, name].join(' → ')} — recursion is not supported`,
        ['fragments', name]
      )
  )

/**
 * Fold each body's own measurements together with its targets', run its
 * `noCache` checks, which read the targets' `caches`, and lift the
 * fallback its call sites shield with — all in reverse topological order,
 * so a target is always complete before a caller reads it.
 * `composeRollups` holds the composition rules themselves, shared with the
 * walk, so a call site in an expression and a call site in a body compose
 * identically.
 */
const foldRollups = (registry: OperatorRegistry, compiled: Map<string, CompileArtifact>) => {
  const done = new Set<string>()

  const fold = (name: string) => {
    if (done.has(name)) return
    done.add(name)
    const entry = registry.fragments.get(name)
    const artifact = compiled.get(name)
    if (entry === undefined || artifact === undefined) return
    for (const call of artifact.fragmentCalls) fold(call.name)
    const rolled = composeRollups(artifact.own, artifact.fragmentCalls, registry.fragments)
    entry.nodeCount = rolled.nodeCount
    entry.maxDepth = rolled.maxDepth
    entry.dependencies = rolled.dependencies
    entry.identityOnly = rolled.identityOnly
    entry.caches = checkNoCache(artifact)
    entry.timeoutFallback = liftedFallback(name, artifact, registry.fragments)
  }

  for (const name of compiled.keys()) fold(name)
}

/**
 * The static fallback a call site lifts from this body (obligation B2):
 * what shielded assembly would splice for the whole call, or `undefined`
 * where the body is not shielded and a call therefore is not either.
 *
 * Every hole must answer, because a call is ONE hole at its call site: it
 * contributes all of its fallbacks or none of them, where the same
 * expression written inline would degrade hole by hole. That is the one
 * place a call is not exactly its expansion, and it is the conservative
 * direction — a partially-finished body cannot contribute a half-real
 * value through a boundary that has already returned a single one.
 *
 * A node root is one hole, and it is the root, so its fallback is the
 * call's. A skeleton root splices its holes' fallbacks into its shape,
 * inside out through any nested skeleton a `vars` block kept — the same
 * assembly a shielded evaluation performs, and relying on the same
 * by-construction ordering: the artifact's holes ARE the skeletons' leaf
 * holes, in walk order (`rootHoles` in src/compile/compile.ts).
 *
 * Each `$error` read comes along, moved to where its hole sits, and
 * located at that hole: the timeout meets the call, but a read written in
 * the body sees it where it would have met the hole inline, as anchoring
 * locates any failure in a body. A read lifted from a nested call is
 * already located, in the innermost body, which owns it as anchoring's
 * first frame does.
 */
const liftedFallback = (
  name: string,
  artifact: CompileArtifact,
  fragments: ReadonlyMap<string, FragmentEntry>
): StaticFallback | undefined => {
  const { root, holes } = artifact
  // A constant body has no hole to lift, and nothing in it can time out
  if (holes.length === 0) return undefined
  const fallbacks: StaticFallback[] = []
  for (const hole of holes) {
    const fallback = holeFallback(hole, fragments)
    if (fallback === undefined) return undefined
    fallbacks.push(fallback)
  }
  const reads: ErrorRead[] = []
  let next = 0
  const assemble = (node: CompiledNode, at: NodePath): unknown => {
    if (node.kind === 'skeleton')
      return splice(
        node.skeleton,
        node.holes,
        node.holes.map((hole) => assemble(hole.node, [...at, ...hole.at]))
      )
    const { value, reads: own = [] } = fallbacks[next++]
    const within = {
      ...(node.kind === 'operator' ? { operator: node.name } : {}),
      fragment: name,
      fragmentPath: toNodePath(node.path),
    }
    for (const read of own)
      reads.push({ ...read, at: [...at, ...read.at], within: read.within ?? within })
    return value
  }
  const value = assemble(root, [])
  return reads.length === 0 ? { value } : { value, reads }
}

/**
 * A hole's own precomputed fallback, or the one its target lifts where the
 * hole is itself a call.
 *
 * The second case cannot come from the artifact: the walk read
 * `entry.timeoutFallback` while compiling this body, which is pass 2, and
 * no target has been folded before pass 4. Resolving it here against the
 * registry is what makes the lift transitive — well-founded because the
 * fold runs in reverse topological order, so a target is always complete
 * before a caller reads it.
 */
const holeFallback = (
  hole: ArtifactHole,
  fragments: ReadonlyMap<string, FragmentEntry>
): StaticFallback | undefined => {
  if (hole.timeoutFallback !== undefined) return hole.timeoutFallback
  const { node } = hole
  // An authored call-site fallback always wins, and a dynamic one
  // disqualifies the hole rather than falling through to the target's
  if (node.kind !== 'fragmentCall' || node.fallback !== undefined) return undefined
  return fragments.get(node.name)?.timeoutFallback
}
