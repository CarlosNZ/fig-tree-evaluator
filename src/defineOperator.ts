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
 * The returned definition is a fresh, deep-frozen, normalized object: every
 * documented default filled, `required` computed once, any conditional null
 * policy compiled to its table (the source function is dropped), `restParam`
 * and `timeoutParam` derived. The input literal is never mutated or branded;
 * `metadata` and `default` values are kept by reference and unfrozen
 * (host-owned, opaque).
 */
import { FigTreeError } from './FigTreeError'
import { ErrorCodes } from './errorCodes'
import type { Issue } from './issues'
import { isPlainObject } from './utils'
import {
  checkConstraints,
  checkType,
  isExpectedType,
  isLiteralType,
  validateConstraintsShape,
  type ExpectedType,
} from './typeCheck'
import { checkNameLegality, RESERVED_NODE_KEYS, RESERVED_REGISTRATION_NAMES } from './names'
import {
  EvaluationData,
  VALIDATED_OPERATOR,
  isValidatedOperator,
  type CompiledNullPolicy,
  type EvaluationMode,
  type NullPolicyValue,
  type OperatorDefinition,
  type ParameterDeclaration,
  type ValidatedOperatorDefinition,
  type ValidatedParameter,
} from './operatorDefinition'

type Path = (string | number)[]

const EVALUATION_MODES: ReadonlySet<string> = new Set([
  'eager',
  'race',
  'lazy',
  'lazyElements',
  'lazyEntries',
  'perElement',
  'structural',
])

const NULL_POLICY_VALUES: ReadonlySet<string> = new Set(['propagate', 'value'])

/** The rest marker on a `positionalParams` entry (`'...values'`). */
const REST_PREFIX = '...'

/** Does a declared type admit `null` (type-driven admission)? */
const typeNamesNull = (type: ExpectedType): boolean => {
  if (type === 'null' || type === 'any') return true
  if (Array.isArray(type)) return type.includes('null') || type.includes('any')
  return false
}

/** Does a declared type admit an array (the `over` target requirement)? */
const typeAdmitsArray = (type: ExpectedType): boolean => {
  if (type === 'array' || type === 'any') return true
  if (Array.isArray(type)) return type.includes('array') || type.includes('any')
  return false
}

/** Is a declared type a container (admits per-element/per-value policies)? */
const typeIsContainer = (type: ExpectedType): boolean => {
  if (type === 'array' || type === 'object' || type === 'any') return true
  if (Array.isArray(type))
    return type.includes('array') || type.includes('object') || type.includes('any')
  return false
}

const throwDefinitionError = (issues: Issue[], operator?: string): never => {
  const [first] = issues
  const more = issues.length - 1
  const message =
    more > 0 ? `${first.message} (+ ${more} more issue${more === 1 ? '' : 's'})` : first.message
  throw new FigTreeError({
    code: ErrorCodes.invalidDefinition,
    message,
    path: first.path,
    ...(operator !== undefined ? { operator } : {}),
    issues,
  })
}

export const defineOperator = (
  definition: OperatorDefinition | ValidatedOperatorDefinition
): ValidatedOperatorDefinition => {
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
    throwDefinitionError(issues)
  }
  const def = definition as OperatorDefinition & Record<string, unknown>

  if (typeof def.name !== 'string')
    addIssue(ErrorCodes.invalidDefinition, "'name' is required and must be a string", ['name'])
  if (typeof def.description !== 'string' || def.description === '')
    addIssue(ErrorCodes.invalidDefinition, "'description' is required and must be non-empty", [
      'description',
    ])
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
  if (issues.length > 0) throwDefinitionError(issues, operator)

  // ── Optional definition-level fields — shape checks ───────────────────
  if (def.alias !== undefined && typeof def.alias !== 'string')
    addIssue(ErrorCodes.invalidDefinition, "'alias' must be a string", ['alias'])
  if (def.useCache !== undefined && typeof def.useCache !== 'boolean')
    addIssue(ErrorCodes.invalidDefinition, "'useCache' must be a boolean", ['useCache'])
  if (def.cache !== undefined && def.cache !== 'auto' && def.cache !== 'manual')
    addIssue(ErrorCodes.invalidDefinition, "'cache' must be 'auto' or 'manual'", ['cache'])
  if (
    def.readsOptions !== undefined &&
    (!Array.isArray(def.readsOptions) || def.readsOptions.some((o) => typeof o !== 'string'))
  )
    addIssue(ErrorCodes.invalidDefinition, "'readsOptions' must be an array of option-block names", [
      'readsOptions',
    ])
  if (def.metadata !== undefined && !isPlainObject(def.metadata))
    addIssue(ErrorCodes.invalidDefinition, "'metadata' must be a plain object", ['metadata'])
  if (
    def.positionalParams !== undefined &&
    (!Array.isArray(def.positionalParams) ||
      def.positionalParams.some((p) => typeof p !== 'string'))
  )
    addIssue(ErrorCodes.invalidDefinition, "'positionalParams' must be an array of parameter names", [
      'positionalParams',
    ])
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
        if (element === EvaluationData)
          checkSentinelFree(element, [...path, i], parameter)
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
    if (RESERVED_REGISTRATION_NAMES.has(value))
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
      if (key === 'default' || key === 'metadata') continue
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
      addIssue(ErrorCodes.invalidDefinition, `'required' must be a boolean`, at('required'), paramName)
    if (d.description !== undefined && typeof d.description !== 'string')
      addIssue(
        ErrorCodes.invalidDefinition,
        `'description' must be a string`,
        at('description'),
        paramName
      )
    if (d.metadata !== undefined && !isPlainObject(d.metadata))
      addIssue(ErrorCodes.invalidDefinition, `'metadata' must be a plain object`, at('metadata'), paramName)

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
        else if (constraintsValid && d.constraints !== undefined) {
          const constrained = checkConstraints(d.default, d.constraints)
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

    if (d.evaluation !== undefined && !EVALUATION_MODES.has(d.evaluation as string))
      addIssue(
        ErrorCodes.invalidDefinition,
        `'evaluation' must be one of ${[...EVALUATION_MODES].join(', ')}`,
        at('evaluation'),
        paramName
      )
    if (d.truthiness !== undefined && typeof d.truthiness !== 'boolean')
      addIssue(ErrorCodes.invalidDefinition, `'truthiness' must be a boolean`, at('truthiness'), paramName)
    if (d.over !== undefined && typeof d.over !== 'string')
      addIssue(ErrorCodes.invalidDefinition, `'over' must be a parameter name`, at('over'), paramName)
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

    // Null policies: vocabulary, type-driven admission, truthiness conflict
    if (d.nullPolicy !== undefined) {
      const policy = d.nullPolicy
      if (typeof policy !== 'function' && !NULL_POLICY_VALUES.has(policy as string))
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `'nullPolicy' must be 'propagate', 'value' or a conditional function`,
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
          `'truthiness' implies null policy 'value' (null is falsy) — declaring 'propagate' is a conflict`,
          at('nullPolicy'),
          paramName
        )
    }
    if (d.elementNullPolicy !== undefined) {
      if (!NULL_POLICY_VALUES.has(d.elementNullPolicy as string)) {
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `'elementNullPolicy' must be 'propagate' or 'value' — the conditional form is not admitted here`,
          at('elementNullPolicy'),
          paramName
        )
      }
      const type = effectiveTypes[paramName]
      if (type !== undefined && !typeIsContainer(type))
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `'elementNullPolicy' applies to container parameters only`,
          at('elementNullPolicy'),
          paramName
        )
    }
  }

  // ── Cross-parameter checks ─────────────────────────────────────────────

  // positionalParams: entries name declared parameters; rest entry last
  // only; no duplicates
  let restParam: string | null = null
  if (Array.isArray(def.positionalParams) && def.positionalParams.every((p) => typeof p === 'string')) {
    const seen = new Set<string>()
    const entries = def.positionalParams
    entries.forEach((entry, i) => {
      const isRest = entry.startsWith(REST_PREFIX)
      const entryName = isRest ? entry.slice(REST_PREFIX.length) : entry
      if (isRest) {
        if (i !== entries.length - 1)
          addIssue(
            ErrorCodes.invalidDefinition,
            `the rest entry '${entry}' must be the last positional entry`,
            ['positionalParams', i]
          )
        else restParam = entryName
      }
      if (!(entryName in declarations))
        addIssue(
          ErrorCodes.invalidDefinition,
          `positional entry '${entry}' names no declared parameter`,
          ['positionalParams', i]
        )
      if (seen.has(entryName))
        addIssue(
          ErrorCodes.invalidDefinition,
          `duplicate positional entry '${entry}'`,
          ['positionalParams', i]
        )
      seen.add(entryName)
    })
  }

  // over ⇔ perElement pairing, and the target must admit an array
  for (const [paramName, d] of Object.entries(declarations)) {
    const paramPath: Path = ['parameters', paramName]
    const isPerElement = d.evaluation === 'perElement'
    if (d.over !== undefined && typeof d.over === 'string') {
      if (!isPerElement)
        addIssue(
          ErrorCodes.invalidDefinition,
          `'over' is legal only with evaluation: 'perElement'`,
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
        `evaluation: 'perElement' requires 'over' to name the iterated sibling`,
        [...paramPath, 'evaluation'],
        paramName
      )
    }
  }

  // replacesNullAt: holder lazy, optional, no default; targets real siblings
  for (const [paramName, d] of Object.entries(declarations)) {
    if (d.replacesNullAt === undefined) continue
    if (!Array.isArray(d.replacesNullAt) || d.replacesNullAt.some((t) => typeof t !== 'string'))
      continue // shape issue already recorded
    const path: Path = ['parameters', paramName, 'replacesNullAt']
    if (d.evaluation !== 'lazy')
      addIssue(
        ErrorCodes.invalidDefinition,
        `a 'replacesNullAt' holder must declare evaluation: 'lazy'`,
        path,
        paramName
      )
    const holderRequired = d.required ?? !('default' in d)
    if (holderRequired)
      addIssue(
        ErrorCodes.invalidDefinition,
        `a 'replacesNullAt' holder must be optional`,
        path,
        paramName
      )
    if ('default' in d)
      addIssue(
        ErrorCodes.invalidDefinition,
        `a 'replacesNullAt' holder may not carry a 'default' — it is presence-sensitive by construction`,
        path,
        paramName
      )
    d.replacesNullAt.forEach((target, i) => {
      if (target === paramName)
        addIssue(
          ErrorCodes.invalidDefinition,
          `'replacesNullAt' may not target the holder itself`,
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
    })
  }

  // Conditional null policies: exactly one literal-union selector in the
  // definition; enumerate its members into a total compiled table
  const literalUnionParams = Object.entries(effectiveTypes)
    .filter(([, type]) => isLiteralType(type))
    .map(([name]) => name)
  const compiledPolicies = new Map<string, CompiledNullPolicy>()

  for (const [paramName, d] of Object.entries(declarations)) {
    if (typeof d.nullPolicy !== 'function') continue
    const path: Path = ['parameters', paramName, 'nullPolicy']
    if (literalUnionParams.length !== 1) {
      addIssue(
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
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `the conditional 'nullPolicy' threw during compilation for member ${JSON.stringify(member)}: ${String(error)}`,
          path,
          paramName
        )
        compiled = false
        break
      }
      if (typeof policy !== 'string' || !NULL_POLICY_VALUES.has(policy)) {
        addIssue(
          ErrorCodes.invalidNullPolicy,
          `the conditional 'nullPolicy' must return 'propagate' or 'value' for every member — got ${JSON.stringify(policy)} for ${JSON.stringify(member)}`,
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
      addIssue(
        ErrorCodes.invalidDefinition,
        `the 'timeoutParam' target must be 'integer'-typed`,
        ['timeoutParam']
      )
  }

  if (issues.length > 0) throwDefinitionError(issues, operator)

  // ── Build the normalized, branded, frozen artifact ─────────────────────
  const validatedParameters: Record<string, ValidatedParameter> = {}
  for (const [paramName, d] of Object.entries(declarations)) {
    const compiled = compiledPolicies.get(paramName)
    const declaredPolicy = typeof d.nullPolicy === 'string' ? d.nullPolicy : undefined
    const type = effectiveTypes[paramName] ?? 'any'
    // truthiness implies 'value' where the type admits null at all
    const impliedPolicy: NullPolicyValue =
      d.truthiness === true && typeNamesNull(type) ? 'value' : 'propagate'

    const parameter: ValidatedParameter = {
      type: cloneTypeExpression(type),
      required: d.required ?? !('default' in d),
      evaluation: (d.evaluation as EvaluationMode) ?? 'eager',
      truthiness: d.truthiness ?? false,
      nullPolicy: compiled ?? declaredPolicy ?? impliedPolicy,
    }
    if ('default' in d) parameter.default = d.default
    if (d.description !== undefined) parameter.description = d.description
    if (d.metadata !== undefined) parameter.metadata = d.metadata
    if (d.elementNullPolicy !== undefined) parameter.elementNullPolicy = d.elementNullPolicy
    if (d.constraints !== undefined) parameter.constraints = deepClone(d.constraints)
    if (d.over !== undefined) parameter.over = d.over
    if (d.replacesNullAt !== undefined) parameter.replacesNullAt = [...d.replacesNullAt]
    validatedParameters[paramName] = parameter
  }

  const validated: ValidatedOperatorDefinition = {
    [VALIDATED_OPERATOR]: true,
    name: def.name,
    description: def.description,
    parameters: validatedParameters,
    restParam,
    timeoutParam: def.timeoutParam ?? null,
    useCache: def.useCache ?? false,
    cache: def.cache ?? 'auto',
    readsOptions: [...(def.readsOptions ?? [])],
    evaluate: def.evaluate,
    returns: def.returns !== undefined ? cloneTypeExpression(def.returns) : 'any',
  }
  if (def.alias !== undefined) validated.alias = def.alias
  if (def.metadata !== undefined) validated.metadata = def.metadata
  if (def.positionalParams !== undefined) validated.positionalParams = [...def.positionalParams]
  if (def.validate !== undefined) validated.validate = def.validate

  return deepFreezeArtifact(validated)
}

/** A fresh copy of a type expression, so freezing never touches the input. */
const cloneTypeExpression = (type: ExpectedType): ExpectedType => {
  if (typeof type === 'string') return type
  if (Array.isArray(type)) return [...type]
  return { literal: [...type.literal] }
}

/** Plain-data deep clone for owned declaration structures (constraints). */
const deepClone = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(deepClone) as T
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) copy[key] = deepClone(child)
    return copy as T
  }
  return value
}

/**
 * Freeze the artifact and every structure it owns. `metadata` bags, `default`
 * values and the two host-supplied functions are left unfrozen — host-owned.
 */
const deepFreezeArtifact = (
  validated: ValidatedOperatorDefinition
): ValidatedOperatorDefinition => {
  for (const parameter of Object.values(validated.parameters)) {
    if (typeof parameter.type !== 'string') Object.freeze(parameter.type)
    if (typeof parameter.type === 'object' && 'literal' in parameter.type)
      Object.freeze(parameter.type.literal)
    if (typeof parameter.nullPolicy === 'object') {
      parameter.nullPolicy.table.forEach((row) => Object.freeze(row))
      Object.freeze(parameter.nullPolicy.table)
      Object.freeze(parameter.nullPolicy)
    }
    if (parameter.constraints !== undefined) deepFreezePlain(parameter.constraints)
    if (parameter.replacesNullAt !== undefined) Object.freeze(parameter.replacesNullAt)
    Object.freeze(parameter)
  }
  Object.freeze(validated.parameters)
  if (typeof validated.returns !== 'string') Object.freeze(validated.returns)
  if (validated.positionalParams !== undefined) Object.freeze(validated.positionalParams)
  Object.freeze(validated.readsOptions)
  return Object.freeze(validated)
}

const deepFreezePlain = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(deepFreezePlain)
    Object.freeze(value)
  } else if (isPlainObject(value)) {
    Object.values(value).forEach(deepFreezePlain)
    Object.freeze(value)
  }
}
