/**
 * Building a definition's normalized, branded artifact — the half of
 * `defineOperator()` every definition needs, kept apart from its checks
 * (src/defineOperator.ts) so that a bundle which never imports
 * `defineOperator` never carries them ("Ruling: the definition checks shake
 * off; the compiler stays" in docs-dev/v3-specs/v3-packaging.md).
 *
 * `buildOperator` builds the package's own definitions, the core and I/O
 * operators. It trusts its input: those definitions are constants, checked
 * where a check can fail a release rather than on every import —
 * test/package-definitions.test.ts holds each built artifact equal to what
 * `defineOperator()` makes of the same literal, and
 * codegen/checkDefinitions.ts runs the checks in `pnpm build`. Every other
 * definition goes through `defineOperator()`, which runs the checks and then
 * this same assembly.
 */
import { FigTreeError } from './FigTreeError'
import { ErrorCodes } from './errorCodes'
import { fnv1a, isPlainObject } from './utils'
import { isLiteralType, typeNamesNull, type ExpectedType } from './typeCheck'
import {
  VALIDATED_OPERATOR,
  type CompiledNullPolicy,
  type DeclarationEntry,
  type EvaluationMode,
  type NullPolicyValue,
  type OperatorCategory,
  type OperatorDefinition,
  type OperatorEvaluate,
  type ParameterDeclaration,
  type ParameterDeclarations,
  type ResolutionPlan,
  type ValidatedOperatorDefinition,
  type ValidatedParameter,
} from './operatorDefinition'

export type Path = (string | number)[]

export type ReportIssue = (code: string, message: string, path: Path, parameter?: string) => void

/** The rest marker on a `positionalParams` entry (`'...values'`). */
export const REST_PREFIX = '...'

export const NULL_POLICY_VALUES: ReadonlySet<string> = new Set(['propagate', 'value'])

/**
 * Types a package definition literal exactly as `defineOperator()` does —
 * the body's `params` inferred from the declarations — and returns it
 * untouched, for `buildOperator` to build. The erased return type is what
 * lets definitions with different parameters share one array.
 */
export const declareOperator = <const P extends ParameterDeclarations>(
  definition: OperatorDefinition<P>
): OperatorDefinition => definition as unknown as OperatorDefinition

/**
 * The trusted build. A conditional null policy that cannot be compiled
 * still throws, since no table built from it would be right.
 */
export const buildOperator = (definition: OperatorDefinition): ValidatedOperatorDefinition => {
  const effectiveTypes: Record<string, ExpectedType> = {}
  for (const [name, declaration] of Object.entries(definition.parameters))
    effectiveTypes[name] = declaration.type ?? 'any'
  const compiledPolicies = compileNullPolicies(
    definition.parameters,
    effectiveTypes,
    (code, message, path) => {
      throw new FigTreeError({ code, message, path, operator: definition.name })
    }
  )
  return assembleOperator(definition, compiledPolicies)
}

/**
 * Conditional null policies: exactly one literal-union selector in the
 * definition, whose members each policy function is enumerated over into a
 * total table. Called once per definition, so each function runs once per
 * member; a failure goes to `report` and leaves that parameter uncompiled.
 * `effectiveTypes` omits any parameter whose declared type is invalid.
 */
export const compileNullPolicies = (
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
  return compiledPolicies
}

/**
 * The normalized, branded, frozen artifact of a well-formed definition:
 * every documented default filled, `required` computed once, conditional
 * null policies replaced by their compiled tables (the source function is
 * dropped), `restParam` and `timeoutParam` derived. The input literal is
 * never mutated or branded; `metadata` and `default` values are kept by
 * reference and unfrozen (host-owned, opaque).
 */
export const assembleOperator = (
  def: OperatorDefinition,
  compiledPolicies: Map<string, CompiledNullPolicy>
): ValidatedOperatorDefinition => {
  const validatedParameters: Record<string, ValidatedParameter> = {}
  for (const [paramName, d] of Object.entries(def.parameters)) {
    const compiled = compiledPolicies.get(paramName)
    const declaredPolicy = typeof d.nullPolicy === 'string' ? d.nullPolicy : undefined
    const type = d.type ?? 'any'
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

  // Only the last entry can be the rest entry in a well-formed definition
  const lastPositional = def.positionalParams?.at(-1)
  const restParam = lastPositional?.startsWith(REST_PREFIX)
    ? lastPositional.slice(REST_PREFIX.length)
    : null

  const validated: ValidatedOperatorDefinition = {
    [VALIDATED_OPERATOR]: true,
    name: def.name,
    category: def.category as OperatorCategory,
    description: def.description,
    parameters: validatedParameters,
    resolution: planResolution(validatedParameters),
    restParam,
    deliversLazily: Object.values(validatedParameters).some(
      (parameter) => parameter.evaluation !== 'eager' && parameter.evaluation !== 'structural'
    ),
    timeoutParam: def.timeoutParam ?? null,
    useCache: def.useCache ?? false,
    cache: def.cache ?? 'auto',
    // Stamped below, once every field it reads is in place
    fingerprint: '',
    evaluate: def.evaluate as OperatorEvaluate,
    returns: def.returns !== undefined ? cloneTypeExpression(def.returns) : 'any',
  }
  if (def.alias !== undefined) validated.alias = def.alias
  if (def.metadata !== undefined) validated.metadata = def.metadata
  if (def.positionalParams !== undefined) validated.positionalParams = [...def.positionalParams]
  if (def.validate !== undefined) validated.validate = def.validate
  validated.fingerprint = fingerprintOf(validated)

  return deepFreezeArtifact(validated)
}

/**
 * The definition's content fingerprint: the fields that decide what the
 * body computes, hashed. An allowlist rather than the whole object, so
 * that "the definition's content" is stated rather than implied:
 * `description` and `alias` cannot change a result, and hashing them would
 * invalidate a persisted store's entries on a docs-only edit; `metadata`
 * is a host-owned bag kept by reference that may hold anything, including
 * values `JSON.stringify` throws on; `deliversLazily` and `resolution` are
 * derived from the parameters already in. A field added to the type later
 * has to be admitted here deliberately. Functions, symbols (the
 * `EvaluationData` default) and regular expressions render as their source
 * text, which `JSON.stringify` would otherwise drop.
 */
const fingerprintOf = (d: ValidatedOperatorDefinition): string =>
  fnv1a(
    JSON.stringify(
      [
        d.name,
        d.parameters,
        d.positionalParams,
        d.restParam,
        d.returns,
        d.useCache,
        d.cache,
        d.timeoutParam,
        d.evaluate,
        d.validate,
      ],
      (_, value: unknown) =>
        typeof value === 'function' || typeof value === 'symbol' || value instanceof RegExp
          ? String(value)
          : value
    )
  )

/** A fresh copy of a type expression, so freezing never touches the input. */
const cloneTypeExpression = (type: ExpectedType): ExpectedType => {
  if (typeof type === 'string') return type
  if (isLiteralType(type)) return { literal: [...type.literal] }
  return [...type]
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

/** The resolver's three declaration lists (`ResolutionPlan`). */
const planResolution = (parameters: Record<string, ValidatedParameter>): ResolutionPlan => {
  const entries: DeclarationEntry[] = Object.entries(parameters)
  return {
    entries,
    whole: entries.filter(
      ([, declared]) =>
        declared.replacesNullAt === undefined && declared.evaluation !== 'perElement'
    ),
    perElement: entries.filter(([, declared]) => declared.evaluation === 'perElement'),
  }
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
  for (const list of Object.values(validated.resolution)) {
    list.forEach((entry: DeclarationEntry) => Object.freeze(entry))
    Object.freeze(list)
  }
  Object.freeze(validated.resolution)
  if (typeof validated.returns !== 'string') Object.freeze(validated.returns)
  if (validated.positionalParams !== undefined) Object.freeze(validated.positionalParams)
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
