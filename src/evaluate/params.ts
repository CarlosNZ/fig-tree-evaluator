/**
 * Parameter resolution — the engine layers a body relies on ("Engine
 * guarantees" in docs-dev/v3-specs/v3-operator-contract.md; "Null policy"
 * in docs-dev/v3-specs/v3-api.md). Two passes over the declarations:
 *
 * Pass 1 starts every eager parameter's evaluation concurrently, delivers
 * structural values verbatim, and turns `replacesNullAt` holders into
 * evaluate-once thunks keyed by their targets. Everything eager is then
 * awaited together, so a failing operand fails the node before any null is
 * considered: failure beats propagation.
 *
 * Pass 2 applies the layers to each declared parameter, in this order:
 *  1. unset detection — absent, or null at an optional parameter whose type
 *     excludes null → the layered default chain (operatorDefaults →
 *     metadata default, the EvaluationData sentinel delivering the merged
 *     data) → or an ABSENT key when nothing declares a default;
 *  2. `replacesNullAt` — a null at a target is replaced by the holder's
 *     once-evaluated value, per element/value where the target declares an
 *     element policy, whole-value otherwise;
 *  3. whole-value null policy — `propagate` resolves the node to null
 *     without running the body, `value` delivers, a compiled conditional
 *     table is consulted through the resolved selector; a null at a type
 *     that does not name null is the derived reject (a type error);
 *  4. element-wise null policy — the same per element / per value;
 *  5. the type check and constraints — the one layer `runtimeTypeCheck:
 *     false` removes (null policy and truthiness are semantics, always on);
 *  6. truthiness — `isTruthy` at declared positions, per element where the
 *     declared type is container-only.
 *
 * Runtime type errors are tagged with the NODE's path and name the
 * parameter in the message (the worked-example shape).
 */
import { FigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import {
  EvaluationData,
  type CompiledNullPolicy,
  type NullPolicyValue,
  type ValidatedParameter,
} from '../operatorDefinition'
import type { OperatorNode } from '../parse'
import { isTruthy } from '../primitives'
import {
  checkConstraintsUnderPolicy,
  checkType,
  describeType,
  typeNamesNull,
  type ExpectedType,
} from '../typeCheck'
import { isPlainObject, once } from '../utils'
import type { EvaluationContext } from './context'
import { evaluateNode } from './evaluate'
import { internalError } from './internal'

export interface ResolvedParameters {
  params: Record<string, unknown>
  /** A `propagate` policy fired: the node is null, the body never runs. */
  propagate: boolean
}

type Thunk = () => Promise<unknown>

export const resolveParams = async (
  node: OperatorNode,
  ctx: EvaluationContext
): Promise<ResolvedParameters> => {
  const { definition, instanceDefaults } = node.entry
  const declarations = Object.entries(definition.parameters)

  // ── Pass 1: start everything ──────────────────────────────────────
  const pendingNames: string[] = []
  const pending: Promise<unknown>[] = []
  const resolved: Record<string, unknown> = {}
  const holders: Record<string, Thunk> = {}

  for (const [name, declared] of declarations) {
    const supplied = node.params[name]
    switch (declared.evaluation) {
      case 'eager':
        if (supplied !== undefined) {
          pendingNames.push(name)
          pending.push(evaluateNode(supplied, ctx))
        }
        break
      case 'structural':
        if (supplied?.kind === 'constant') resolved[name] = supplied.value
        break
      case 'lazy':
        if (declared.replacesNullAt === undefined) throw notYet(node, name, declared, 'Phase 5')
        {
          // A holder supplied on the node, else its instance-wide default
          // (the same chain as any parameter; holders carry no metadata
          // default by registration rule)
          const thunk =
            supplied !== undefined
              ? once(() => evaluateNode(supplied, ctx))
              : instanceDefaults !== undefined && Object.hasOwn(instanceDefaults, name)
                ? once(() => instanceDefaults[name])
                : undefined
          if (thunk !== undefined)
            for (const target of declared.replacesNullAt) holders[target] = thunk
        }
        break
      case 'perElement':
        throw notYet(node, name, declared, 'Phase 6')
      default:
        throw notYet(node, name, declared, 'Phase 5')
    }
  }

  const settled = await Promise.all(pending)
  pendingNames.forEach((name, i) => {
    resolved[name] = settled[i]
  })

  // ── Pass 2: the layers ────────────────────────────────────────────
  const params: Record<string, unknown> = {}

  for (const [name, declared] of declarations) {
    if (declared.evaluation === 'lazy') continue // holders never reach the body
    let value = resolved[name]

    // 1. unset → the default chain, else absent
    const unset =
      value === undefined || (value === null && !declared.required && !typeNamesNull(declared.type))
    if (unset) {
      if (instanceDefaults !== undefined && Object.hasOwn(instanceDefaults, name)) {
        value = instanceDefaults[name]
      } else if ('default' in declared) {
        value = declared.default === EvaluationData ? ctx.data : declared.default
      } else {
        continue
      }
    }

    // 2. replacesNullAt
    const holder = holders[name]
    if (holder !== undefined) value = await replaceNulls(value, declared, holder)

    // 3. whole-value null policy
    if (value === null) {
      if (typeNamesNull(declared.type)) {
        const policy = effectivePolicy(node, declared, resolved)
        if (policy === 'propagate') return { params, propagate: true }
      } else if (ctx.runtimeTypeCheck) {
        throw typeError(node, name, checkType(value, declared.type))
      }
    }

    // 4. element-wise null policy
    if (declared.elementNullPolicy === 'propagate' && containsNull(value))
      return { params, propagate: true }

    // 5. the type check + constraints
    if (ctx.runtimeTypeCheck && value !== null) {
      const typed = checkType(value, declared.type)
      if (!typed.ok) throw typeError(node, name, typed)
      if (declared.constraints !== undefined) {
        const constrained = checkConstraintsUnderPolicy(
          value,
          declared.constraints,
          declared.elementNullPolicy !== undefined
        )
        if (!constrained.ok) throw typeError(node, name, constrained)
      }
    }

    // 6. truthiness
    if (declared.truthiness) value = applyTruthiness(value, declared.type)

    params[name] = value
  }

  return { params, propagate: false }
}

const notYet = (node: OperatorNode, name: string, declared: ValidatedParameter, phase: string) =>
  internalError(
    `parameter '${name}' of '${node.name}' declares evaluation '${declared.evaluation}', which lands in ${phase}`
  )

const typeError = (
  node: OperatorNode,
  name: string,
  result: { ok: false; expected: string; actual: string } | { ok: true }
): FigTreeError => {
  const detail = result.ok ? '' : `: expected ${result.expected}, received ${result.actual}`
  return new FigTreeError({
    code: ErrorCodes.typeCheck,
    message: `${node.name} – parameter '${name}'${detail}`,
    path: node.path,
    operator: node.name,
  })
}

/** The declared policy, or the compiled table read through its selector. */
const effectivePolicy = (
  node: OperatorNode,
  declared: ValidatedParameter,
  resolved: Record<string, unknown>
): NullPolicyValue => {
  if (typeof declared.nullPolicy === 'string') return declared.nullPolicy
  const compiled: CompiledNullPolicy = declared.nullPolicy
  const selectorDeclared = node.entry.definition.parameters[compiled.selector]
  const selectorValue = effectiveSelectorValue(node, compiled.selector, resolved)
  const typed = checkType(selectorValue, selectorDeclared.type)
  if (!typed.ok) throw typeError(node, compiled.selector, typed)
  const row = compiled.table.find((entry) => entry.value === selectorValue)
  if (row === undefined) throw typeError(node, compiled.selector, checkType(selectorValue, 'null'))
  return row.policy
}

/** A selector's value through the same default chain as any parameter. */
const effectiveSelectorValue = (
  node: OperatorNode,
  selector: string,
  resolved: Record<string, unknown>
): unknown => {
  const value = resolved[selector]
  if (value !== undefined && value !== null) return value
  const defaults = node.entry.instanceDefaults
  if (defaults !== undefined && Object.hasOwn(defaults, selector)) return defaults[selector]
  const declared = node.entry.definition.parameters[selector]
  return 'default' in declared ? declared.default : value
}

const replaceNulls = async (
  value: unknown,
  declared: ValidatedParameter,
  holder: Thunk
): Promise<unknown> => {
  if (declared.elementNullPolicy !== undefined) {
    if (Array.isArray(value) && value.includes(null)) {
      const replacement = await holder()
      return value.map((element) => (element === null ? replacement : element))
    }
    if (isPlainObject(value) && Object.values(value).includes(null)) {
      const replacement = await holder()
      const copy: Record<string, unknown> = {}
      for (const [key, element] of Object.entries(value))
        copy[key] = element === null ? replacement : element
      return copy
    }
    return value
  }
  return value === null ? holder() : value
}

const containsNull = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.includes(null)
  if (isPlainObject(value)) return Object.values(value).includes(null)
  return false
}

/** Is the declared type container-only: `array`, `object`, or their union? */
const isContainerOnly = (type: ExpectedType): boolean => {
  if (typeof type === 'object' && !Array.isArray(type)) return false
  const members = Array.isArray(type) ? type : [type]
  return members.every((member) => member === 'array' || member === 'object')
}

const applyTruthiness = (value: unknown, type: ExpectedType): unknown => {
  if (isContainerOnly(type)) {
    if (Array.isArray(value)) return value.map(isTruthy)
    if (isPlainObject(value)) {
      const judged: Record<string, boolean> = {}
      for (const [key, element] of Object.entries(value)) judged[key] = isTruthy(element)
      return judged
    }
  }
  return isTruthy(value)
}

// describeType is re-exported for the boundary's messages
export { describeType }
