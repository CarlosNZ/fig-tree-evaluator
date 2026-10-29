/**
 * What a `null` does at each parameter of a definition: its null behaviour
 * ("Null policy" in docs-dev/v3-specs/v3-api.md). Worked out once, at
 * registration, from the rest of the declaration, and carried on the
 * validated parameter: parameter resolution (src/evaluate/params.ts)
 * resolves a `null` by it, and `getOperators()` reports it. The rules are
 * met in the engine's order: the compiler first, which owns an iterator's
 * `as` binding, then parameter resolution.
 */
import type {
  ConditionalNullBehavior,
  NullBehavior,
  NullPolicyValue,
  ValidatedParameter,
} from './operatorDefinition'
import {
  typeAdmitsContainer,
  typeNamesNull,
  type Constraints,
  type ExpectedType,
} from './typeCheck'

/** A parameter as `buildOperator` has it before its behaviours are known. */
export type Declared = Omit<ValidatedParameter, 'nullBehavior' | 'elementNullBehavior'>

/**
 * The whole value's behaviour. A holder (`replacesNullAt`) replaces a null
 * with a null, which is no replacement. An iterator's `as` must be a
 * literal name, so a null there is a compile error (`invalid-as`). At a
 * type that doesn't name null, a null is a type error, or counts as left
 * out at an optional parameter resolved before the body runs; a handle is
 * checked when the body demands it, with no default to fall back on.
 * Otherwise the policy decides, and on a lazily delivered parameter that
 * is always `accept` (defineOperator).
 */
export const nullBehaviorOf = (
  name: string,
  declared: Declared,
  parameters: Record<string, Declared>
): NullBehavior | ConditionalNullBehavior => {
  const { evaluationMode: mode, nullPolicy } = declared
  if (declared.replacesNullAt) return 'omit'
  if (
    name === 'as' &&
    mode === 'literal' &&
    Object.values(parameters).some((sibling) => sibling.evaluationMode === 'perElement')
  )
    return 'error'
  if (!typeNamesNull(declared.type))
    return declared.required || mode === 'lazy' || mode === 'perElement' ? 'error' : 'omit'
  // A type naming null always carries a policy
  if (typeof nullPolicy === 'string') return nullPolicy
  return {
    selector: nullPolicy!.selector,
    table: nullPolicy!.table.map(({ value, policy }) => ({ value, behavior: policy })),
  }
}

/**
 * A fragment parameter's behaviour. It declares no policy and no delivery
 * mode, and the body receives a null its type names; otherwise the null is
 * a type error at a required parameter, and counts as left out at an
 * optional one, which takes its default, else null.
 */
export const argumentNullBehaviorOf = (declared: {
  type: ExpectedType
  required: boolean
}): 'accept' | 'omit' | 'error' =>
  typeNamesNull(declared.type) ? 'accept' : declared.required ? 'error' : 'omit'

/**
 * A null element's behaviour, where the type admits a container: the
 * declared element policy; else `error` where a `homogeneous` constraint
 * without `any`, or an `elementShape`, rules a null out; else `accept`,
 * since an element nothing covers reaches the operator as it is. A fragment
 * parameter's too, which declares no element policy.
 */
export const elementNullBehaviorOf = (declared: {
  type: ExpectedType
  constraints?: Constraints
  elementNullPolicy?: NullPolicyValue
  replacesNullAt?: readonly string[]
}): ValidatedParameter['elementNullBehavior'] => {
  if (declared.replacesNullAt || !typeAdmitsContainer(declared.type)) return undefined
  if (declared.elementNullPolicy !== undefined) return declared.elementNullPolicy
  const { homogeneous, elementShape } = declared.constraints ?? {}
  return elementShape || (homogeneous && !homogeneous.includes('any')) ? 'error' : 'accept'
}
