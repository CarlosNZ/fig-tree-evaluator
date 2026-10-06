/**
 * Rules 1 and 2 of the coverage walk ("The seven rules" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): what each parameter of an
 * operator node receives, and whether it can fail its type check. It
 * follows `resolveParams` in src/evaluate/params.ts layer by layer, over
 * what is known of each child's output rather than over values: the
 * default chain, null meaning unset, `replacesNullAt`, the null policies,
 * then the type check and constraints.
 */
import { isTruthy } from '../primitives/truthiness'
import { typeNamesNull } from '../typeCheck'
import { isPlainObject } from '../utils'
import type { ExpectedType } from '../typeCheck'
import type { CompiledNode, OperatorNode } from '../compile/artifact'
import type { ValidatedParameter } from '../operatorDefinition'
import type { FragmentParameter } from '../fragments'
import {
  ANY,
  NOTHING,
  admitsNull,
  containsNull,
  exactly,
  fits,
  narrow,
  ofType,
  onlyNull,
  replaceNullElements,
  withoutNullElements,
  union,
  unionOf,
  withoutNull,
} from './known'
import type { Answer, Known } from './known'
import type { Failure } from './findings'

export interface Inputs {
  /** What each parameter's value is known to be, past its layers */
  received: Record<string, Known>
  /** The received parameters that may also have no value at all */
  absent: Set<string>
  /** The parameters' type-check findings, in declaration order */
  failures: Failure[]
  /**
   * Whether a null policy can resolve the node to null without running the
   * body: never, for some inputs, or always
   */
  propagates: Answer
  /**
   * Where the layers surely end the node before its body, in the engine's
   * order: the first type check that must fail, or a null that must
   * propagate
   */
  ends?: Failure | 'null'
  /** The `replacesNullAt` holders the layers may ask for */
  consulted: Set<string>
}

/**
 * A parameter's value before its layers: what it may be, and whether it
 * may be absent.
 */
interface Pending {
  known: Known
  absent: boolean
}

const describe = (type: ExpectedType): string =>
  typeof type === 'string'
    ? type
    : Array.isArray(type)
      ? type.join(' | ')
      : `one of ${(type as { literal: unknown[] }).literal.map((v) => JSON.stringify(v)).join(', ')}`

/**
 * The default chain: the instance's `operatorDefaults` value, else the
 * declared default.
 */
const defaultOf = (
  node: OperatorNode,
  name: string,
  declared: ValidatedParameter
): Known | undefined => {
  const defaults = node.entry.instanceDefaults
  if (defaults !== undefined && Object.hasOwn(defaults, name)) return exactly(defaults[name])
  if (!('default' in declared)) return undefined
  // The `EvaluationData` sentinel delivers the evaluation data
  return typeof declared.default === 'symbol' ? ANY : exactly(declared.default)
}

/** Whether a container-lazy parameter received its literal container. */
const literalContainer = (declared: ValidatedParameter, supplied: CompiledNode): boolean =>
  declared.evaluation === 'lazyEntries' ? supplied.kind === 'entries' : supplied.kind === 'elements'

/**
 * The policies a null at this parameter can meet: one, or either where a
 * conditional policy's selector is not known exactly.
 */
const policiesOf = (
  declared: ValidatedParameter,
  pending: Record<string, Pending>
): Set<'propagate' | 'value'> => {
  const policy = declared.nullPolicy
  if (typeof policy === 'string') return new Set([policy])
  const selector = pending[policy.selector]?.known ?? NOTHING
  const exact = selector.every((member) => 'exact' in member)
  const rows = exact
    ? policy.table.filter((row) => selector.some((m) => 'exact' in m && m.exact === row.value))
    : policy.table
  return new Set(rows.map((row) => row.policy))
}

export const resolveInputs = (node: OperatorNode, outputs: Record<string, Known>): Inputs => {
  const { definition } = node.entry
  const { entries, whole } = definition.resolution
  const received: Record<string, Known> = {}
  const absent = new Set<string>()
  const failures: Failure[] = []
  const pending: Record<string, Pending> = {}
  const delivered = new Set<string>()
  const holders: Record<string, { name: string; known: Known }> = {}
  const consulted = new Set<string>()
  let propagates: Answer = 'no'
  let ends: Failure | 'null' | undefined

  const check = (name: string, declared: ValidatedParameter, known: Known, certain: boolean) => {
    const answer = fits(
      known,
      declared.type,
      declared.constraints,
      declared.elementNullPolicy !== undefined
    )
    if (answer === 'yes') return
    const failure: Failure = {
      path: node.path,
      code: 'type-check',
      message: `${node.name} – parameter '${name}': may receive something other than ${describe(declared.type)}${declared.constraints !== undefined ? ', as constrained' : ''}`,
      certainty: answer === 'no' && certain ? 'always' : 'may',
      operator: node.name,
      parameter: name,
      order: [node.order],
    }
    failures.push(failure)
    if (answer === 'no' && certain) ends ??= failure
  }

  // Pass 1: what each supplied parameter starts as
  for (const [name, declared] of entries) {
    const supplied = node.params[name]
    switch (declared.evaluation) {
      case 'eager':
        if (supplied !== undefined) pending[name] = { known: outputs[name], absent: false }
        break
      case 'structural':
        if (supplied?.kind === 'constant')
          pending[name] = { known: exactly(supplied.value), absent: false }
        break
      case 'lazy':
        if (declared.replacesNullAt !== undefined) {
          const holder = supplied !== undefined ? outputs[name] : defaultOf(node, name, declared)
          if (holder !== undefined)
            for (const target of declared.replacesNullAt) holders[target] = { name, known: holder }
        } else if (supplied !== undefined) {
          // A handle, vetted when the body demands it, if it does
          delivered.add(name)
          check(name, declared, outputs[name], false)
          received[name] = narrow(outputs[name], declared.type)
        }
        break
      case 'lazyElements':
      case 'lazyEntries':
      case 'race':
        if (supplied === undefined) break
        // Handles over a literal container are judged for truthiness only;
        // anything else degenerates to an eager value
        if (literalContainer(declared, supplied)) {
          delivered.add(name)
          received[name] = outputs[name]
        } else pending[name] = { known: outputs[name], absent: false }
        break
      case 'perElement':
        break
    }
  }

  // The defaults pass: an unset parameter takes its default chain, or is
  // removed. A null is unset at an optional parameter whose type excludes it
  for (const [name, declared] of whole) {
    if (delivered.has(name)) continue
    const value = pending[name] ?? { known: NOTHING, absent: true }
    const nullUnset = !declared.required && !typeNamesNull(declared.type) && admitsNull(value.known)
    if (!value.absent && !nullUnset) continue
    const chain = defaultOf(node, name, declared)
    const kept = nullUnset ? withoutNull(value.known) : value.known
    pending[name] = {
      known: chain === undefined ? kept : union(kept, chain),
      absent: chain === undefined,
    }
  }

  // Pass 2: the layers, in the engine's order. A certain propagation ends
  // the node there, as it does at runtime
  for (const [name, declared] of whole) {
    if (delivered.has(name)) continue
    let known = pending[name]?.known ?? NOTHING
    if (known.length === 0) continue
    if (pending[name].absent) absent.add(name)

    const holder = holders[name]
    if (holder !== undefined) {
      const replaced =
        declared.elementNullPolicy !== undefined ? containsNull(known) !== 'no' : admitsNull(known)
      if (replaced) {
        consulted.add(holder.name)
        known =
          declared.elementNullPolicy !== undefined
            ? replaceNullElements(known, holder.known)
            : union(withoutNull(known), holder.known)
      }
    }

    // `propagate` is inert on a lazily delivered parameter
    const lazily = declared.evaluation !== 'eager' && declared.evaluation !== 'structural'
    if (admitsNull(known) && typeNamesNull(declared.type) && !lazily) {
      const policies = policiesOf(declared, pending)
      if (policies.has('propagate')) {
        const certain = policies.size === 1 && onlyNull(known)
        propagates = certain ? 'yes' : 'maybe'
        if (certain) {
          ends ??= 'null'
          break
        }
        if (policies.size === 1) known = withoutNull(known)
      }
    }

    if (declared.elementNullPolicy === 'propagate') {
      const nulls = containsNull(known)
      if (nulls !== 'no') {
        propagates = nulls === 'yes' ? 'yes' : 'maybe'
        if (nulls === 'yes') {
          ends ??= 'null'
          break
        }
        known = withoutNullElements(known)
      }
    }

    check(name, declared, known, true)
    received[name] = vetted(declared, known)
  }

  // A type check is certain only if no null can end the node before it
  if (propagates !== 'no')
    for (const failure of failures) if (failure.certainty === 'always') failure.certainty = 'may'
  return { received, absent, failures, propagates, consulted, ...(ends ? { ends } : {}) }
}

const containerOnly = (type: ExpectedType): boolean => {
  const members = typeof type === 'string' ? [type] : Array.isArray(type) ? type : []
  return members.length > 0 && members.every((member) => member === 'array' || member === 'object')
}

/**
 * One value judged by truthiness, element by element for a container-only
 * type (`applyTruthiness` in src/evaluate/params.ts).
 */
export const judge = (value: unknown, type: ExpectedType): unknown => {
  if (containerOnly(type)) {
    if (Array.isArray(value)) return value.map(isTruthy)
    if (isPlainObject(value)) {
      const judgedValues: Record<string, unknown> = {}
      for (const [key, element] of Object.entries(value)) judgedValues[key] = isTruthy(element)
      return judgedValues
    }
  }
  return isTruthy(value)
}

/**
 * What a parameter delivers once its type check passes: the value, or
 * what truthiness makes of it, exactly where the value is known exactly.
 */
export const vetted = (declared: ValidatedParameter, known: Known): Known => {
  const passed = narrow(known, declared.type)
  if (!declared.truthiness) return passed
  if (passed.length > 0 && passed.every((member) => 'exact' in member))
    return unionOf(
      passed.map((member) => exactly(judge((member as { exact: unknown }).exact, declared.type)))
    )
  return containerOnly(declared.type) ? ANY : ofType('boolean')
}

/**
 * A fragment argument as the call resolves it (`resolveArgument` in
 * src/evaluate/fragment.ts): a null at an optional parameter whose type
 * excludes it takes the default, else null; anything else passes the
 * declared type and constraints, or fails. The constraints are checked on
 * a null the type admits, too.
 */
export const argumentInput = (
  declared: FragmentParameter,
  known: Known
): { known: Known; answer: Answer } => {
  const unset = !declared.required && !typeNamesNull(declared.type) && admitsNull(known)
  const rest = unset ? withoutNull(known) : known
  let answer = fits(rest, declared.type, declared.constraints)
  if (answer === 'yes' && declared.constraints !== undefined && admitsNull(rest)) answer = 'maybe'
  const unsetValue = unset ? exactly(declared.default ?? null) : NOTHING
  return { known: union(narrow(rest, declared.type), unsetValue), answer }
}

/**
 * A `perElement` parameter's result, vetted per element as a lazy handle
 * is (`perElementHandle` in src/evaluate/params.ts).
 */
export const checkElementResult = (
  node: OperatorNode,
  name: string,
  declared: ValidatedParameter,
  known: Known
): Failure | undefined => {
  if (fits(known, declared.type, declared.constraints) === 'yes') return undefined
  return {
    path: node.path,
    code: 'type-check',
    message: `${node.name} – parameter '${name}': an element's result may be other than ${describe(declared.type)}`,
    certainty: 'may',
    operator: node.name,
    parameter: name,
    order: [node.order],
  }
}
