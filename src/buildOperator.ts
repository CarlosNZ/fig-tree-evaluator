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
import { fnv1a, isPlainObject } from './utils'
import { typeNamesNull, type ExpectedType, type LiteralType } from './typeCheck'
import { isLiteralType } from './typeIntersection'
import {
  VALIDATED_OPERATOR,
  type CompiledNullPolicy,
  type DeclarationEntry,
  type EvaluationMode,
  type NullPolicyValue,
  type OperatorCategory,
  type OperatorDefinition,
  type OperatorEvaluate,
  type ParameterDeclarations,
  type ResolutionPlan,
  type ValidatedOperatorDefinition,
  type ValidatedParameter,
} from './operatorDefinition'

export type Path = (string | number)[]

/** The rest marker on a `positionalParams` entry (`'...values'`). */
export const REST_PREFIX = '...'

/**
 * A definition of the package's own: as authored, less the `description`,
 * which the core and I/O operators keep in `./editor-hints` with the rest
 * of their display text, so that a host that never shows it never ships it.
 */
export type PackageDefinition<P extends ParameterDeclarations = ParameterDeclarations> = Omit<
  OperatorDefinition<P>,
  'description'
>

/**
 * Types a package definition literal exactly as `defineOperator()` does —
 * the body's `params` inferred from the declarations — and returns it
 * untouched, for `buildOperator` to build. The erased return type is what
 * lets definitions with different parameters share one array.
 */
export const declareOperator = <const P extends ParameterDeclarations>(
  definition: PackageDefinition<P>
): PackageDefinition => definition as unknown as PackageDefinition

/**
 * The trusted build: the package's own definitions, which
 * `defineOperator()` checks in the test suite and at build instead
 * (test/package-definitions.test.ts, codegen/checkDefinitions.ts). A
 * conditional null policy compiles to its table over the definition's one
 * literal-union parameter, unchecked.
 */
export const buildOperator = (definition: PackageDefinition): ValidatedOperatorDefinition => {
  const declarations = Object.entries(definition.parameters)
  const compiledPolicies = new Map<string, CompiledNullPolicy>()
  for (const [name, { nullPolicy }] of declarations) {
    if (typeof nullPolicy !== 'function') continue
    const [selector, { type }] = declarations.find(
      ([, declaration]) => declaration.type !== undefined && isLiteralType(declaration.type)
    )!
    const { literal } = type as LiteralType
    compiledPolicies.set(name, {
      selector,
      table: literal.map((value) => ({ value, policy: nullPolicy(value) as NullPolicyValue })),
    })
  }
  return assembleOperator(definition, compiledPolicies)
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
  def: PackageDefinition & { description?: string },
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
    parameters: validatedParameters,
    resolution: planResolution(validatedParameters),
    restParam,
    deliversLazily: Object.values(validatedParameters).some(
      (parameter) => parameter.evaluation !== 'eager' && parameter.evaluation !== 'structural'
    ),
    timeoutParam: def.timeoutParam ?? null,
    cache: def.cache === true,
    // Stamped below, once every field it reads is in place
    fingerprint: '',
    evaluate: def.evaluate as OperatorEvaluate,
    returns: def.returns !== undefined ? cloneTypeExpression(def.returns) : 'any',
  }
  if (def.description !== undefined) validated.description = def.description
  if (def.alias !== undefined) validated.alias = def.alias
  if (def.metadata !== undefined) validated.metadata = def.metadata
  if (def.positionalParams !== undefined) validated.positionalParams = [...def.positionalParams]
  if (def.validate !== undefined) validated.validate = def.validate
  // Copied, since the artifact is frozen and the literal is the host's
  if (def.analysis !== undefined) validated.analysis = deepClone(def.analysis)
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
 * values `JSON.stringify` throws on. A parameter's own `description` and
 * `metadata` are left out for the same reasons. `deliversLazily` and
 * `resolution` are derived from the parameters already in. A field added
 * to the type later has to be admitted here deliberately. Functions,
 * symbols (the `EvaluationData` default) and regular expressions render as
 * their source text, which `JSON.stringify` would otherwise drop.
 */
const fingerprintOf = (d: ValidatedOperatorDefinition): string =>
  fnv1a(
    JSON.stringify(
      [
        d.name,
        Object.entries(d.parameters).map(([name, parameter]) => [
          name,
          parameterContent(parameter),
        ]),
        d.positionalParams,
        d.restParam,
        d.returns,
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

/** A parameter less the two fields the fingerprint leaves out. */
const parameterContent = (parameter: ValidatedParameter): Record<string, unknown> => {
  const content: Record<string, unknown> = { ...parameter }
  delete content.description
  delete content.metadata
  return content
}

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
