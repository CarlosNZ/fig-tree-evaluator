/**
 * `defineOperator()` — the isolation validator ("The definition shape" and
 * "Registration & validation" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * Validates a definition in isolation (no knowledge of other operators),
 * loudly, at build time: every violation in the contract's validation list
 * becomes an `error`-severity `Issue` with a path into the authored literal,
 * and all of them are thrown together in one `FigTreeError` (code
 * `invalid-definition`). Cross-registry checks (name collisions,
 * `operatorDefaults` resolution) belong to instance registration
 * (src/registry.ts), which trusts the brand and never re-validates.
 *
 * A definition that passes is assembled by src/buildOperator.ts into a
 * fresh, deep-frozen, normalized artifact. The assembly lives there, apart
 * from these checks, because the package's own definitions are built
 * without them: a bundle that never imports this module never carries them.
 */
import { ErrorCodes } from './errorCodes'
import { issuesError, type Issue } from './issues'
import { isPlainObject } from './utils'
import {
  checkDeclaredConstraints,
  checkType,
  isExpectedType,
  typeAdmitsArray,
  typeAdmitsContainer,
  typeNamesNull,
  validateConstraintsShape,
  type ExpectedType,
} from './typeCheck'
import { checkNameLegality, isReservedRegistrationName, RESERVED_NODE_KEYS } from './names'
import {
  EvaluationData,
  OPERATOR_CATEGORIES,
  isValidatedOperator,
  type CompiledNullPolicy,
  type NullPolicyValue,
  type OperatorDefinition,
  type ParameterDeclaration,
  type ParameterDeclarations,
  type ValidatedOperatorDefinition,
} from './operatorDefinition'
import { REST_PREFIX, assembleOperator, type Path } from './buildOperator'
import { isLiteralType } from './typeIntersection'
import { checkAnalysis } from './analysisCheck'

const EVALUATION_MODES: ReadonlySet<string> = new Set([
  'eager',
  'race',
  'lazy',
  'lazyElements',
  'lazyEntries',
  'perElement',
  'literal',
])

/**
 * The `category` vocabulary, closed. Required rather than
 * optional-with-a-default: a silent fallback produces exactly the
 * uncategorized entries the field exists to prevent, so an author who
 * genuinely fits nowhere picks `other` deliberately.
 */
const CATEGORIES: ReadonlySet<string> = new Set(OPERATOR_CATEGORIES)

const NULL_POLICY_VALUES: ReadonlySet<string> = new Set(['propagate', 'accept'])

type ReportIssue = (code: string, message: string, path: Path, parameter?: string) => void

/**
 * Overloads rather than one signature over a union, because a union
 * defeats the inference this function exists to provide. With
 * `OperatorDefinition<P> | ValidatedOperatorDefinition` as one parameter
 * type, a literal carrying enough of the validated shape's fields stops
 * being contextually typed at all, and every body parameter silently
 * becomes `any`.
 *
 * Ordered so the idempotent case is tried first: a plain literal cannot
 * match it, since the brand symbol is unforgeable outside this module, so
 * it falls through to the inferring overload.
 */
export function defineOperator(definition: ValidatedOperatorDefinition): ValidatedOperatorDefinition
export function defineOperator<const P extends ParameterDeclarations>(
  definition: OperatorDefinition<P>
): ValidatedOperatorDefinition
export function defineOperator(
  definition: OperatorDefinition<ParameterDeclarations> | ValidatedOperatorDefinition
): ValidatedOperatorDefinition {
  // Idempotence: a validated definition is already the artifact
  if (isValidatedOperator(definition)) return definition

  const issues: Issue[] = []
  const operatorName = isPlainObject(definition) ? definition.name : undefined
  const operator = typeof operatorName === 'string' ? operatorName : undefined

  const addIssue = (code: string, message: string, path: Path, parameter?: string) => {
    issues.push({
      severity: 'error',
      code,
      message,
      path,
      ...(operator !== undefined ? { operator } : {}),
      ...(parameter !== undefined ? { parameter } : {}),
    })
  }

  // ── Structural gate — without these, nothing else can be checked ──────
  if (!isPlainObject(definition)) {
    addIssue(ErrorCodes.invalidDefinition, 'a definition must be a plain object', [])
    throw issuesError(ErrorCodes.invalidDefinition, issues)
  }
  const def = definition as unknown as OperatorDefinition & Record<string, unknown>

  if (typeof def.name !== 'string')
    addIssue(ErrorCodes.invalidDefinition, "'name' is required and must be a string", ['name'])
  if (!isPlainObject(def.parameters))
    addIssue(
      ErrorCodes.invalidDefinition,
      "'parameters' is required and must be an object of declarations (may be {})",
      ['parameters']
    )
  if (typeof def.evaluate !== 'function')
    addIssue(ErrorCodes.invalidDefinition, "'evaluate' is required and must be a function", [
      'evaluate',
    ])
  if (issues.length > 0) throw issuesError(ErrorCodes.invalidDefinition, issues, operator)

  // ── Definition-level fields — shape checks ────────────────────────────
  // `category` is required but is NOT in the gate above: nothing else
  // depends on it, so it reports alongside every other violation
  if (typeof def.category !== 'string')
    addIssue(
      ErrorCodes.invalidDefinition,
      `'category' is required and must be one of ${[...CATEGORIES].join(', ')}`,
      ['category']
    )
  else if (!CATEGORIES.has(def.category))
    addIssue(
      ErrorCodes.invalidDefinition,
      `'${def.category}' is not a category — expected one of ${[...CATEGORIES].join(', ')}`,
      ['category']
    )
  if (def.alias !== undefined && typeof def.alias !== 'string')
    addIssue(ErrorCodes.invalidDefinition, "'alias' must be a string", ['alias'])
  if (def.cache !== undefined && def.cache !== true)
    addIssue(ErrorCodes.invalidDefinition, "'cache' must be the literal true", ['cache'])
  if (def.metadata !== undefined && !isPlainObject(def.metadata))
    addIssue(ErrorCodes.invalidDefinition, "'metadata' must be a plain object", ['metadata'])
  if (
    def.positionalParams !== undefined &&
    (!Array.isArray(def.positionalParams) ||
      def.positionalParams.some((p) => typeof p !== 'string'))
  )
    addIssue(
      ErrorCodes.invalidDefinition,
      "'positionalParams' must be an array of parameter names",
      ['positionalParams']
    )
  if (def.timeoutParam !== undefined && typeof def.timeoutParam !== 'string')
    addIssue(ErrorCodes.invalidDefinition, "'timeoutParam' must be a parameter name", [
      'timeoutParam',
    ])
  if (def.validate !== undefined && typeof def.validate !== 'function')
    addIssue(ErrorCodes.invalidDefinition, "'validate' must be a function", ['validate'])
  if (def.returns !== undefined && !isExpectedType(def.returns))
    addIssue(ErrorCodes.invalidDefinition, "'returns' must be a metadata-vocabulary type", [
      'returns',
    ])

  // ── The EvaluationData sentinel — legal only as a parameter default ───
  const checkSentinelFree = (value: unknown, path: Path, parameter?: string) => {
    if (value === EvaluationData) {
      addIssue(
        ErrorCodes.invalidDefinition,
        "the EvaluationData sentinel is legal only as a parameter 'default'",
        path,
        parameter
      )
    } else if (Array.isArray(value)) {
      value.forEach((element, i) => {
        if (element === EvaluationData) checkSentinelFree(element, [...path, i], parameter)
      })
    }
  }
  for (const [key, value] of Object.entries(def)) {
    if (key === 'parameters' || key === 'metadata') continue
    checkSentinelFree(value, [key])
  }

  // ── Names: the shared legality rule + the reservation sets ────────────
  const checkRegistrationName = (value: string, path: Path) => {
    const legality = checkNameLegality(value)
    if (!legality.ok) {
      addIssue(ErrorCodes.invalidName, `'${value}': ${legality.reason}`, path)
      return
    }
    if (isReservedRegistrationName(value))
      addIssue(ErrorCodes.reservedName, `'${value}' is a reserved name`, path)
  }
  if (typeof def.name === 'string') checkRegistrationName(def.name, ['name'])
  if (typeof def.alias === 'string') checkRegistrationName(def.alias, ['alias'])

  const parameters = def.parameters as Record<string, unknown>
  // Declarations that passed the shape gate — the ones later stages may read
  const declarations: Record<string, ParameterDeclaration> = {}

  for (const [paramName, declaration] of Object.entries(parameters)) {
    const paramPath: Path = ['parameters', paramName]
    const legality = checkNameLegality(paramName)
    if (!legality.ok)
      addIssue(ErrorCodes.invalidName, `'${paramName}': ${legality.reason}`, paramPath, paramName)
    // The flat reservation: node keys only — reference-namespace words are
    // deliberately legal as parameter names
    else if (RESERVED_NODE_KEYS.has(paramName))
      addIssue(
        ErrorCodes.reservedName,
        `'${paramName}' is a reserved node key and cannot name a parameter`,
        paramPath,
        paramName
      )
    if (!isPlainObject(declaration)) {
      addIssue(
        ErrorCodes.invalidDefinition,
        `the declaration for '${paramName}' must be a plain object`,
        paramPath,
        paramName
      )
      continue
    }
    declarations[paramName] = declaration as ParameterDeclaration
  }

  // ── Per-parameter declaration checks ───────────────────────────────────
  // Effective (defaulted, validated) types, for the checks that consult a
  // sibling's type; absent where the declared type was itself invalid
  const effectiveTypes: Record<string, ExpectedType> = {}

  for (const [paramName, decl] of Object.entries(declarations)) {
    const paramPath: Path = ['parameters', paramName]
    const at = (field: string): Path => [...paramPath, field]
    const d = decl as ParameterDeclaration & Record<string, unknown>

    for (const [key, value] of Object.entries(d)) {
      if (key === 'default') continue
      checkSentinelFree(value, at(key), paramName)
    }

    let typeValid = true
    if (d.type !== undefined && !isExpectedType(d.type)) {
      addIssue(
        ErrorCodes.invalidDefinition,
        `'type' must be a metadata-vocabulary type`,
        at('type'),
        paramName
      )
      typeValid = false
    }
    if (typeValid) effectiveTypes[paramName] = d.type ?? 'any'

    let constraintsValid = false
    if (d.constraints !== undefined) {
      const shape = validateConstraintsShape(d.constraints)
      if (!shape.ok)
        addIssue(
          ErrorCodes.invalidDefinition,
          `'constraints' is malformed: expected ${shape.expected}, got ${shape.actual}`,
          at('constraints'),
          paramName
        )
      else constraintsValid = true
    }

    if (d.required !== undefined && typeof d.required !== 'boolean')
      addIssue(
        ErrorCodes.invalidDefinition,
        `'required' must be a boolean`,
        at('required'),
        paramName
      )

    const hasDefault = 'default' in d
    if (hasDefault && d.required === true)
      addIssue(
        ErrorCodes.invalidDefinition,
        `a 'default' contradicts 'required: true' — a default implies the parameter is optional`,
        at('default'),
        paramName
      )
    // The sentinel bypasses the fits-the-type check: the delivered value is
    // the merged evaluation data, not the constant
    if (hasDefault && d.default !== EvaluationData) {
      const type = effectiveTypes[paramName]
      if (type !== undefined) {
        const fit = checkType(d.default, type)
        if (!fit.ok)
          addIssue(
            ErrorCodes.typeCheck,
            `'default' does not satisfy the declared type: expected ${fit.expected}, got ${fit.actual}`,
            at('default'),
            paramName
          )
        else if (constraintsValid) {
          const constrained = checkDeclaredConstraints(d.default, d)
          if (!constrained.ok)
            addIssue(
              ErrorCodes.typeCheck,
              `'default' violates the declared constraints: expected ${constrained.expected}, got ${constrained.actual}`,
              at('default'),
              paramName
            )
        }
      }
    }

    if (d.evaluationMode !== undefined && !EVALUATION_MODES.has(d.evaluationMode as string))
      addIssue(
        ErrorCodes.invalidDefinition,
        `'evaluationMode' must be one of ${[...EVALUATION_MODES].join(', ')}`,
        at('evaluationMode'),
        paramName
      )
    if (d.truthiness !== undefined && typeof d.truthiness !== 'boolean')
      addIssue(
        ErrorCodes.invalidDefinition,
        `'truthiness' must be a boolean`,
        at('truthiness'),
        paramName
      )
    if (d.over !== undefined && typeof d.over !== 'string')
      addIssue(
        ErrorCodes.invalidDefinition,
        `'over' must be a parameter name`,
        at('over'),
        paramName
      )
    if (
      d.replacesNullAt !== undefined &&
      (!Array.isArray(d.replacesNullAt) || d.replacesNullAt.some((t) => typeof t !== 'string'))
    )
      addIssue(
        ErrorCodes.invalidDefinition,
        `'replacesNullAt' must be an array of sibling parameter names`,
        at('replacesNullAt'),
        paramName
      )

    // Null policies: vocabulary, type-driven admission, truthiness conflict,
    // delivery mode. A holder's are checked with its `replacesNullAt`
    const isHolder = d.replacesNullAt !== undefined
    if (d.nullPolicy !== undefined && !isHolder) {
      const policy = d.nullPolicy
      if (typeof policy !== 'function' && !NULL_POLICY_VALUES.has(policy as string))
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `'nullPolicy' must be 'propagate', 'accept' or a conditional function`,
          at('nullPolicy'),
          paramName
        )
      const type = effectiveTypes[paramName]
      if (type !== undefined && !typeNamesNull(type))
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `'nullPolicy' is legal only where the declared type names 'null' — a type without 'null' is the reject declaration`,
          at('nullPolicy'),
          paramName
        )
      if (d.truthiness === true && policy === 'propagate')
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `'truthiness' implies null policy 'accept' (null is falsy) — declaring 'propagate' is a conflict`,
          at('nullPolicy'),
          paramName
        )
    }
    if (d.elementNullPolicy !== undefined && !isHolder) {
      if (!NULL_POLICY_VALUES.has(d.elementNullPolicy as string)) {
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `'elementNullPolicy' must be 'propagate' or 'accept' — the conditional form is not admitted here`,
          at('elementNullPolicy'),
          paramName
        )
      }
      const type = effectiveTypes[paramName]
      if (type !== undefined && !typeAdmitsContainer(type))
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `'elementNullPolicy' applies to container parameters only`,
          at('elementNullPolicy'),
          paramName
        )
    }
    // A null reaches a lazily delivered parameter's operator whatever is
    // declared: by the time the body demands the value, it is running
    const mode = d.evaluationMode
    if (mode !== undefined && mode !== 'eager' && mode !== 'literal' && !isHolder)
      for (const field of ['nullPolicy', 'elementNullPolicy'] as const) {
        const policy = d[field]
        if (policy === 'propagate' || typeof policy === 'function')
          addIssue(
            ErrorCodes.invalidNullPolicy,
            `'${field}' can only be 'accept' with evaluationMode '${mode}' — a null always reaches the operator`,
            at(field),
            paramName
          )
      }
  }

  // ── Cross-parameter checks ─────────────────────────────────────────────

  // positionalParams: entries name declared parameters; rest entry last
  // only; no duplicates
  if (
    Array.isArray(def.positionalParams) &&
    def.positionalParams.every((p) => typeof p === 'string')
  ) {
    const seen = new Set<string>()
    const entries = def.positionalParams
    entries.forEach((entry, i) => {
      const isRest = entry.startsWith(REST_PREFIX)
      const entryName = isRest ? entry.slice(REST_PREFIX.length) : entry
      if (isRest && i !== entries.length - 1)
        addIssue(
          ErrorCodes.invalidDefinition,
          `the rest entry '${entry}' must be the last positional entry`,
          ['positionalParams', i]
        )
      if (!(entryName in declarations))
        addIssue(
          ErrorCodes.invalidDefinition,
          `positional entry '${entry}' names no declared parameter`,
          ['positionalParams', i]
        )
      if (seen.has(entryName))
        addIssue(ErrorCodes.invalidDefinition, `duplicate positional entry '${entry}'`, [
          'positionalParams',
          i,
        ])
      seen.add(entryName)
    })
  }

  // over ⇔ perElement pairing, and the target must admit an array
  for (const [paramName, d] of Object.entries(declarations)) {
    const paramPath: Path = ['parameters', paramName]
    const isPerElement = d.evaluationMode === 'perElement'
    if (d.over !== undefined && typeof d.over === 'string') {
      if (!isPerElement)
        addIssue(
          ErrorCodes.invalidDefinition,
          `'over' is legal only with evaluationMode: 'perElement'`,
          [...paramPath, 'over'],
          paramName
        )
      else {
        const target = d.over
        if (!(target in declarations) || target === paramName)
          addIssue(
            ErrorCodes.invalidDefinition,
            `'over' names no sibling parameter ('${target}')`,
            [...paramPath, 'over'],
            paramName
          )
        else {
          const targetType = effectiveTypes[target]
          if (targetType !== undefined && !typeAdmitsArray(targetType))
            addIssue(
              ErrorCodes.invalidDefinition,
              `the 'over' target '${target}' must admit an array`,
              [...paramPath, 'over'],
              paramName
            )
        }
      }
    } else if (isPerElement) {
      addIssue(
        ErrorCodes.invalidDefinition,
        `evaluationMode: 'perElement' requires 'over' to name the iterated sibling`,
        [...paramPath, 'evaluationMode'],
        paramName
      )
    }
  }

  // replacesNullAt: the holder lazy, optional, no default, its type without
  // null and no null policy or truthiness of its own; targets real, eager
  // or literal siblings, each by one holder. A null at the
  // holder replaces a null with a null, which is no replacement, and its
  // value never reaches the body, so a policy there could never apply
  const claimed: Record<string, string> = {}
  for (const [paramName, d] of Object.entries(declarations)) {
    if (d.replacesNullAt === undefined) continue
    const paramPath: Path = ['parameters', paramName]
    for (const field of ['nullPolicy', 'elementNullPolicy', 'truthiness'] as const)
      if (d[field] !== undefined && d[field] !== false)
        addIssue(
          field === 'truthiness' ? ErrorCodes.invalidDefinition : ErrorCodes.invalidNullPolicy,
          `a 'replacesNullAt' parameter takes no '${field}' — its value never reaches the operator`,
          [...paramPath, field],
          paramName
        )
    const type = effectiveTypes[paramName]
    if (type !== undefined && typeNamesNull(type))
      addIssue(
        ErrorCodes.invalidDefinition,
        `a 'replacesNullAt' parameter's type may not include 'null' — a null there means no replacement`,
        [...paramPath, 'type'],
        paramName
      )
    if (!Array.isArray(d.replacesNullAt) || d.replacesNullAt.some((t) => typeof t !== 'string'))
      continue // shape issue already recorded
    const path: Path = [...paramPath, 'replacesNullAt']
    if (d.evaluationMode !== 'lazy')
      addIssue(
        ErrorCodes.invalidDefinition,
        `a 'replacesNullAt' parameter must declare evaluationMode: 'lazy'`,
        path,
        paramName
      )
    const holderRequired = d.required ?? !('default' in d)
    if (holderRequired)
      addIssue(
        ErrorCodes.invalidDefinition,
        `a 'replacesNullAt' parameter must be optional`,
        path,
        paramName
      )
    if ('default' in d)
      addIssue(
        ErrorCodes.invalidDefinition,
        `a 'replacesNullAt' parameter may not carry a 'default' — it is presence-sensitive by construction`,
        path,
        paramName
      )
    d.replacesNullAt.forEach((target, i) => {
      if (target === paramName)
        addIssue(
          ErrorCodes.invalidDefinition,
          `'replacesNullAt' may not target the parameter declaring it`,
          [...path, i],
          paramName
        )
      else if (!(target in declarations))
        addIssue(
          ErrorCodes.invalidDefinition,
          `'replacesNullAt' target '${target}' names no sibling parameter`,
          [...path, i],
          paramName
        )
      else {
        // Nulls are replaced in a whole value, before the body runs, so a
        // lazily delivered target's would arrive unreplaced; and a target
        // has one replacement, or one would silently override the other
        const mode = declarations[target].evaluationMode ?? 'eager'
        const claimant = claimed[target]
        if (mode !== 'eager' && mode !== 'literal')
          addIssue(
            ErrorCodes.invalidDefinition,
            `'replacesNullAt' target '${target}' must be eager or literal, not '${mode}'`,
            [...path, i],
            paramName
          )
        else if (claimant !== undefined && claimant !== paramName)
          addIssue(
            ErrorCodes.invalidDefinition,
            `'replacesNullAt' target '${target}' is already replaced by '${claimant}'`,
            [...path, i],
            paramName
          )
        claimed[target] = paramName
      }
    })
  }

  // Conditional null policies, compiled here so that a failure reports
  // beside every other violation
  const compiledPolicies = compileNullPolicies(declarations, effectiveTypes, addIssue)

  // timeoutParam: names a declared integer-typed parameter (Q5 resolution —
  // one field names one parameter, so at-most-one holds by construction)
  if (typeof def.timeoutParam === 'string') {
    const target = declarations[def.timeoutParam]
    if (target === undefined)
      addIssue(
        ErrorCodes.invalidDefinition,
        `'timeoutParam' names no declared parameter ('${def.timeoutParam}')`,
        ['timeoutParam']
      )
    else if (effectiveTypes[def.timeoutParam] !== 'integer')
      addIssue(ErrorCodes.invalidDefinition, `the 'timeoutParam' target must be 'integer'-typed`, [
        'timeoutParam',
      ])
  }

  if (def.analysis !== undefined)
    checkAnalysis(def.analysis, declarations, (code, message, path) =>
      addIssue(code, message, path)
    )

  if (issues.length > 0) throw issuesError(ErrorCodes.invalidDefinition, issues, operator)

  return assembleOperator(def, compiledPolicies)
}

/**
 * Conditional null policies: exactly one literal-union selector in the
 * definition, whose members each policy function is enumerated over into a
 * total table. Called once per definition, so each function runs once per
 * member; a failure goes to `report` and leaves that parameter uncompiled.
 * `effectiveTypes` omits any parameter whose declared type is invalid.
 */
const compileNullPolicies = (
  declarations: Record<string, ParameterDeclaration>,
  effectiveTypes: Record<string, ExpectedType>,
  report: ReportIssue
): Map<string, CompiledNullPolicy> => {
  const literalUnionParams = Object.entries(effectiveTypes)
    .filter(([, type]) => isLiteralType(type))
    .map(([name]) => name)
  const compiledPolicies = new Map<string, CompiledNullPolicy>()

  for (const [paramName, d] of Object.entries(declarations)) {
    if (typeof d.nullPolicy !== 'function') continue
    const path: Path = ['parameters', paramName, 'nullPolicy']
    if (literalUnionParams.length !== 1) {
      report(
        ErrorCodes.invalidNullPolicy,
        `a conditional 'nullPolicy' requires exactly one literal-union parameter in the definition — found ${literalUnionParams.length}`,
        path,
        paramName
      )
      continue
    }
    const selector = literalUnionParams[0]
    const selectorType = effectiveTypes[selector]
    if (!isLiteralType(selectorType)) continue // unreachable; narrows the type
    const table: CompiledNullPolicy['table'] = []
    let compiled = true
    for (const member of selectorType.literal) {
      let policy: unknown
      try {
        policy = d.nullPolicy(member)
      } catch (error) {
        report(
          ErrorCodes.invalidNullPolicy,
          `the conditional 'nullPolicy' threw during compilation for member ${JSON.stringify(member)}: ${String(error)}`,
          path,
          paramName
        )
        compiled = false
        break
      }
      if (typeof policy !== 'string' || !NULL_POLICY_VALUES.has(policy)) {
        report(
          ErrorCodes.invalidNullPolicy,
          `the conditional 'nullPolicy' must return 'propagate' or 'accept' for every member — got ${JSON.stringify(policy)} for ${JSON.stringify(member)}`,
          path,
          paramName
        )
        compiled = false
        break
      }
      table.push({ value: member, policy: policy as NullPolicyValue })
    }
    if (compiled) compiledPolicies.set(paramName, { selector, table })
  }
  return compiledPolicies
}
