/**
 * Fragment registration — the compile-once pipeline behind the `fragments`
 * option ("Fragments" in docs-dev/v3-specs/v3-api.md).
 *
 * A fragment is an expression registered under a name, with declared
 * parameters. Registration *is* its parse moment: `new FigTree()` and
 * `updateOptions()` throw on a bad fragment, so a call that registered can
 * only fail at runtime for data-dependent reasons. That posture is what
 * lets a call site splice a precompiled body and lets the static checker
 * resolve `$params` against a declaration set.
 *
 * Five passes, in this order for reasons that matter:
 *
 *  1. Shape, names and declarations — every entry exists, declarations
 *     filled, before any body compiles. That is what gives batch semantics:
 *     a body may call any fragment in the same batch regardless of key
 *     order, because the lookup it parses against is already complete.
 *  2. Bodies — `parseExpression` + `runStaticChecks` over each `expression`,
 *     with the declared parameter names as the `$params` scope. Bodies
 *     compile in isolation, which is also where the sealing rules enforce
 *     themselves: a body referencing a caller's var or iterator binding has
 *     nothing to resolve against and fails HERE rather than surprising a
 *     call site.
 *  3. Cycles — recursion is banned, so a fragment transitively reaching
 *     itself is a registration error.
 *  4. Rollups, in reverse topological order (well-founded because pass 3
 *     proved a DAG): the transitive measurements a call site needs from its
 *     target.
 *
 * Every fragment in the registry is always rebuilt together: a registry
 * change rebuilds from the merged options, so replacement re-validation and
 * operators-change re-validation are the same path as first registration,
 * with no special case. Nothing here is barrel surface except the two
 * authored types.
 */
import { ErrorCodes } from './errorCodes'
import type { Issue } from './issues'
import { checkNameLegality, RESERVED_NODE_KEYS, RESERVED_REGISTRATION_NAMES } from './names'
import {
  composeRollups,
  parseExpression,
  runStaticChecks,
  type ArtifactDependencies,
  type CompiledNode,
  type NodePath,
  type ParseArtifact,
} from './parse'
import type { OperatorRegistry } from './registry'
import {
  checkConstraints,
  checkType,
  isExpectedType,
  validateConstraintsShape,
  type Constraints,
  type ExpectedType,
  type TypeDeclaration,
} from './typeCheck'
import { isPlainObject } from './utils'

/**
 * A fragment parameter declaration as authored. Extends the same
 * `TypeDeclaration` base an operator's `ParameterDeclaration` extends, so
 * the two stay byte-compatible: `type`, `required` and `constraints` are
 * inherited and mean exactly what they mean for an operator parameter.
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
  /** Opaque tooling bag; the engine never reads it. */
  metadata?: Record<string, unknown>
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
 * site and what the evaluator runs. The four rollups are transitive — they
 * count *through* nested calls, by composition rules that differ because
 * the quantities do (see `composeRollups`).
 */
export interface FragmentEntry {
  name: string
  description?: string
  metadata?: Record<string, unknown>
  parameters: Record<string, FragmentParameter>
  /** The compiled body. Assigned in pass 2; never reassigned after. */
  body: CompiledNode
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
   * The body root's constant fallback, where it has one. A call node with
   * no `fallback` of its own lifts this for timeout shielding — without the
   * lift, factoring an expression into a fragment silently unshields it.
   */
  staticFallback?: { value: unknown }
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
const DEFINITION_KEYS = new Set(['expression', 'parameters', 'description', 'metadata'])

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
  // the batch. Each body's own measurements are what the artifact carries
  // here: every target still reads zero, so composition at its call sites
  // adds nothing, and pass 4 does the real folding.
  const compiled = new Map<string, ParseArtifact>()
  for (const [name, entry] of registry.fragments) {
    const definition = (definitions as Record<string, FragmentDefinition>)[name]
    const artifact = parseExpression(definition.expression, registry, { basePath: ['expression'] })
    runStaticChecks(artifact, { fragmentParams: new Set(Object.keys(entry.parameters)) })
    for (const { issue } of artifact.issues) {
      if (issue.severity === 'error')
        addIssue(issue.code, `fragment '${name}': ${issue.message}`, [
          'fragments',
          name,
          ...issue.path,
        ])
      else entry.warnings.push(issue)
    }
    entry.body = artifact.root
    compiled.set(name, artifact)
  }

  // ── Pass 3: cycles ────────────────────────────────────────────────
  const acyclic = checkCycles(compiled, addIssue)

  // ── Pass 4: rollups ───────────────────────────────────────────────
  if (acyclic) foldRollups(registry, compiled)
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
  if (RESERVED_REGISTRATION_NAMES.has(name)) {
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
      `fragment '${name}' must be a wrapper object: { expression, parameters?, description?, metadata? }`,
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
    body: { kind: 'constant', value: null, path: [], order: 0 },
    warnings: [],
    nodeCount: 0,
    maxDepth: 0,
    dependencies: { dataPaths: [], dynamic: false, operators: [], fragments: [] },
    identityOnly: false,
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
    if (constraints !== undefined) {
      const constrained = checkConstraints(declared.default, constraints)
      if (!constrained.ok) {
        addIssue(
          ErrorCodes.typeCheck,
          `the default for '${parameter}' violates its declared constraints: expected ${constrained.expected}, got ${constrained.actual}`,
          [...path, 'default']
        )
        return undefined
      }
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
 * Recursion is banned, so any fragment transitively reaching itself is a
 * registration error — guarded recursion included. Returns whether the
 * graph is acyclic, which is what makes the rollup fold well-founded.
 */
const checkCycles = (compiled: Map<string, ParseArtifact>, addIssue: AddIssue): boolean => {
  const visiting: string[] = []
  const settled = new Set<string>()
  const reported = new Set<string>()

  const walk = (name: string) => {
    const cycleAt = visiting.indexOf(name)
    if (cycleAt !== -1) {
      const cycle = [...visiting.slice(cycleAt), name]
      // One report per cycle, keyed on its member set: every entry point
      // into the same loop would otherwise report it again
      const key = [...cycle].sort().join('\u0000')
      if (!reported.has(key))
        addIssue(
          ErrorCodes.fragmentCycle,
          `fragment '${name}' reaches itself: ${cycle.join(' → ')} — recursion is not supported`,
          ['fragments', name]
        )
      reported.add(key)
      return
    }
    if (settled.has(name)) return
    visiting.push(name)
    for (const call of compiled.get(name)?.fragmentCalls ?? []) walk(call.name)
    visiting.pop()
    settled.add(name)
  }

  for (const name of compiled.keys()) walk(name)
  return reported.size === 0
}

/**
 * Fold each body's own measurements together with its targets', in reverse
 * topological order so a target is always complete before a caller reads
 * it. `composeRollups` holds the composition rules themselves — shared with
 * the walk, so a call site in an expression and a call site in a body
 * compose identically.
 */
const foldRollups = (registry: OperatorRegistry, compiled: Map<string, ParseArtifact>) => {
  const done = new Set<string>()

  const fold = (name: string) => {
    if (done.has(name)) return
    done.add(name)
    const entry = registry.fragments.get(name)
    const artifact = compiled.get(name)
    if (entry === undefined || artifact === undefined) return
    for (const call of artifact.fragmentCalls) fold(call.name)
    const rolled = composeRollups(artifact, artifact.fragmentCalls, registry.fragments)
    entry.nodeCount = rolled.nodeCount
    entry.maxDepth = rolled.maxDepth
    entry.dependencies = rolled.dependencies
    entry.identityOnly = rolled.identityOnly
    entry.staticFallback = bodyRootFallback(artifact)
  }

  for (const name of compiled.keys()) fold(name)
}

/**
 * The body root's static fallback, where the root is a single evaluable
 * node that declared a constant one. The artifact already computed it —
 * a node root is exactly one hole, and it is the root. A skeleton-rooted
 * body would need per-hole treatment and is deliberately not lifted.
 */
const bodyRootFallback = (artifact: ParseArtifact): { value: unknown } | undefined => {
  const [hole] = artifact.holes
  if (artifact.holes.length !== 1 || hole.node !== artifact.root) return undefined
  return hole.staticFallback
}
