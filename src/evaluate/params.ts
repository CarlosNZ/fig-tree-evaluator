/**
 * Parameter resolution — the engine layers a body relies on ("Engine
 * guarantees" in docs-dev/v3-specs/v3-operator-contract.md; "Null policy"
 * in docs-dev/v3-specs/v3-api.md). Three passes over the declarations:
 *
 * Pass 1 starts every eager parameter's evaluation concurrently, delivers
 * structural values verbatim, and turns `replacesNullAt` holders into
 * evaluate-once thunks keyed by their targets. Everything eager is then
 * awaited together, so a failing operand fails the node before any null is
 * considered: failure beats propagation.
 *
 * The defaults pass resolves every unset parameter — absent, or null at an
 * optional parameter whose type excludes null — through the layered
 * default chain (operatorDefaults → metadata default, the EvaluationData
 * sentinel delivering the merged data), or removes it when nothing declares
 * a default. It runs before any layer so that a layer reading a SIBLING (a
 * conditional null policy's selector) sees the same defaulted value the
 * sibling's own layers will.
 *
 * Pass 2 applies the layers to each declared parameter, in this order:
 *  1. absence — a parameter the defaults pass removed delivers no key;
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
import { renamedBinding, type CompiledNode, type OperatorNode } from '../parse'
import { isTruthy } from '../primitives'
import { LAZY_HANDLE, type LazyValue, type PerElement } from '../runtimeInterface'
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
import { pushBinding } from './bindings'
import { indexedStream, raceStream, settledStream } from './race'
import { pushVars } from './scope'

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
  /** Names already delivered as handles — the layers ran inside them. */
  const delivered = new Set<string>()
  /** Names whose eagerly-resolved value still has to become handles. */
  const degenerate: Record<string, string> = {}

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
        if (declared.replacesNullAt !== undefined) {
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
          break
        }
        // An ordinary lazy parameter: the body holds the handle and decides
        // whether to demand it. Unsupplied falls to the default chain in
        // pass 2, which wraps the default in a pre-resolved handle
        if (supplied !== undefined) {
          resolved[name] = demand(supplied, node, name, declared, ctx)
          delivered.add(name)
        }
        break
      case 'lazyElements':
      case 'lazyEntries':
      case 'race':
        if (supplied === undefined) break
        if (containerHandles(supplied, declared, ctx, name, resolved)) {
          delivered.add(name)
          break
        }
        // Degeneration: the value arrives dynamically, so it is already
        // data. Resolve it eagerly through the ordinary layers, then hand
        // the body pre-resolved handles — sequencing becomes iteration and
        // branch selection becomes lookup, with no body-side special case
        pendingNames.push(name)
        pending.push(evaluateNode(supplied, ctx))
        degenerate[name] = declared.evaluation
        break
      case 'perElement':
        // Nothing starts here: the handle needs its `over` sibling
        // VETTED, so it is built in pass 2 once that parameter's own
        // layers have run (see layerOrder)
        break
      default:
        // Every delivery mode is handled above, and this is what keeps
        // that true: an eighth mode added to the union fails the BUILD
        // here rather than reaching a node as a runtime surprise
        declared.evaluation satisfies never
    }
  }

  const settled = await Promise.all(pending)
  pendingNames.forEach((name, i) => {
    resolved[name] = settled[i]
  })

  // ── The defaults pass: the layered chain, else removal ────────────
  for (const [name, declared] of declarations) {
    // Holders and per-element handles carry no whole value; a handle
    // delivered in pass 1 runs its layers on demand
    if (declared.replacesNullAt !== undefined || declared.evaluation === 'perElement') continue
    if (delivered.has(name)) continue
    const value = resolved[name]
    const unset =
      value === undefined || (value === null && !declared.required && !typeNamesNull(declared.type))
    if (!unset) continue
    if (instanceDefaults !== undefined && Object.hasOwn(instanceDefaults, name)) {
      resolved[name] = instanceDefaults[name]
    } else if ('default' in declared) {
      resolved[name] = declared.default === EvaluationData ? ctx.data : declared.default
    } else {
      delete resolved[name]
    }
  }

  // ── Pass 2: the layers ────────────────────────────────────────────
  const params: Record<string, unknown> = {}

  for (const [name, declared] of layerOrder(declarations)) {
    if (declared.replacesNullAt !== undefined) continue // holders never reach the body
    if (declared.evaluation === 'perElement') {
      const supplied = node.params[name]
      // Unsupplied is a missing-required static error; nothing to deliver
      if (supplied !== undefined)
        params[name] = perElementHandle(supplied, params, node, name, declared, ctx)
      continue
    }
    if (delivered.has(name)) {
      // Delivered as a handle in pass 1: its layers run on demand, and
      // there is no whole value here for the unset chain to test
      params[name] = resolved[name]
      continue
    }
    let value = resolved[name]

    // 1. absent: nothing supplied and nothing declared a default
    if (value === undefined) continue

    // 2. replacesNullAt
    const holder = holders[name]
    if (holder !== undefined) value = await replaceNulls(value, declared, holder)

    // 3. whole-value null policy. `propagate` is inert on a lazily
    //    delivered parameter and MUST be skipped, not merely unused: it
    //    means "resolve the node without running the body", and the body
    //    is the thing that demands a handle. Letting it fire would make
    //    `{ $if: [true, 'yes'] }` resolve null — the unset `else` takes
    //    its declared default of null, which is a whole value reaching
    //    this layer, and the node would short-circuit before the taken
    //    branch was ever demanded. The derived reject (layer 5) still
    //    applies: a null container at a degenerating parameter is a type
    //    error
    const lazily = declared.evaluation !== 'eager' && declared.evaluation !== 'structural'
    if (value === null && typeNamesNull(declared.type) && !lazily) {
      if (effectivePolicy(node, declared, resolved) === 'propagate')
        return { params, propagate: true }
    }

    // 4. element-wise null policy
    if (declared.elementNullPolicy === 'propagate' && containsNull(value))
      return { params, propagate: true }

    // 5. the type check + constraints. A null at a type that does not name
    //    null fails the type check: the derived reject
    if (ctx.runtimeTypeCheck) {
      const typed = checkType(value, declared.type)
      if (!typed.ok) throw typeError(node, name, typed)
      if (value !== null && declared.constraints !== undefined) {
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

    // 7. the lazy family's delivery, over a value the layers have passed:
    //    an unsupplied lazy parameter's default, and the degeneration rule
    params[name] = wrapDelivery(value, declared, degenerate[name])
  }

  return { params, propagate: false }
}

// ── The lazy family: handles, and the layers they carry ─────────────

/**
 * An engine handle. `once()` is the whole of the at-most-once, shared and
 * rejection-memoized guarantee; the brand is what the escaped-handle guard
 * reads at the result boundary.
 */
const handleOf = (evaluate: () => Promise<unknown>): LazyValue => ({
  [LAZY_HANDLE]: true,
  evaluate: once(evaluate),
})

/** A handle over a value that already exists — the degeneration shape. */
const settledHandle = (value: unknown): LazyValue => ({
  [LAZY_HANDLE]: true,
  evaluate: () => Promise.resolve(value),
})

/**
 * A lazily-delivered whole value: evaluated on demand, then put through the
 * same type check, constraints and truthiness an eager parameter passes
 * before delivery. The engine's promise that a body never sees an unvetted
 * value holds for every mode — it is only the *moment* that moves.
 *
 * Null policy is the one layer that cannot come along: `propagate` means
 * "resolve the node without running the body", and by the time a handle is
 * demanded the body is already running. Both readings coincide in practice
 * — every holder of a lazy parameter hands a null straight back — so the
 * setting is inert here rather than an error (ruled September 2026).
 */
const demand = (
  supplied: CompiledNode,
  node: OperatorNode,
  name: string,
  declared: ValidatedParameter,
  ctx: EvaluationContext
): LazyValue =>
  handleOf(async () => vet(await evaluateNode(supplied, ctx), node, name, declared, ctx))

const vet = (
  value: unknown,
  node: OperatorNode,
  name: string,
  declared: ValidatedParameter,
  ctx: EvaluationContext
): unknown => {
  if (ctx.runtimeTypeCheck) {
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
  return declared.truthiness ? applyTruthiness(value, declared.type) : value
}

/**
 * The `perElement` delivery: one compiled subtree stamped over the elements
 * of its `over` sibling, each in a fresh binding scope, memoized per index.
 *
 * Unlike the container-lazy modes, the declared type here describes the
 * ELEMENT RESULT rather than a container — `over` names the container — so
 * the full vet runs per index, exactly as it does for a `lazy` handle: type
 * check, constraints and truthiness. That is what lets `filter` and the
 * deciders read plain booleans.
 *
 * `settle()` builds a fresh stream each call rather than memoizing one: a
 * settlement stream is consumed as it is iterated, so a shared one would be
 * empty the second time. Nothing is evaluated twice regardless, because the
 * per-index memo below is what the streams are built over.
 */
const perElementHandle = (
  supplied: CompiledNode,
  params: Record<string, unknown>,
  node: OperatorNode,
  name: string,
  declared: ValidatedParameter,
  ctx: EvaluationContext
): PerElement => {
  if (declared.over === undefined)
    throw internalError(`parameter '${name}' of '${node.name}' declares perElement without 'over'`)
  const target = params[declared.over]
  // Type-checked by the target's own layers, except under
  // `runtimeTypeCheck: false`, where a non-array iterates over nothing
  const collection = Array.isArray(target) ? target : []
  const as = renamedBinding(node)
  const memo = new Map<number, Promise<unknown>>()

  const evaluate = (index: number): Promise<unknown> => {
    const existing = memo.get(index)
    if (existing !== undefined) return existing
    const started = (async () =>
      vet(
        await evaluateNode(supplied, pushBinding(ctx, as, collection[index], index)),
        node,
        name,
        declared,
        ctx
      ))()
    // Attached where the promise is created, which is the only point early
    // enough: a body that demands an index and then resolves without
    // awaiting it must not leave an unhandled rejection behind. A later
    // awaiter still sees the rejection — this only marks it handled
    started.catch(() => {})
    memo.set(index, started)
    return started
  }

  return {
    [LAZY_HANDLE]: true,
    evaluate,
    settle: () => indexedStream(collection.length, evaluate, (value) => value),
  }
}

/**
 * Declaration order, with every `over` target ahead of the `perElement`
 * parameter that iterates it. The handle closes over the target's vetted
 * value, so the target's layers must already have run — including
 * `nullInputDefault`'s replacement, which is the whole reason a null
 * `input` can become `[]` before the derived reject sees it.
 */
const layerOrder = (
  declarations: [string, ValidatedParameter][]
): [string, ValidatedParameter][] => {
  if (!declarations.some(([, declared]) => declared.evaluation === 'perElement'))
    return declarations
  const byName = new Map(declarations)
  const ordered: [string, ValidatedParameter][] = []
  const seen = new Set<string>()
  const emit = (name: string, declared: ValidatedParameter) => {
    if (seen.has(name)) return
    seen.add(name)
    const over = declared.evaluation === 'perElement' ? declared.over : undefined
    const target = over === undefined ? undefined : byName.get(over)
    if (over !== undefined && target !== undefined) emit(over, target)
    ordered.push([name, declared])
  }
  for (const [name, declared] of declarations) emit(name, declared)
  return ordered
}

/**
 * One element or entry of a container-lazy parameter. The declared type
 * describes the *container* (`array`, `object`) and the language has no
 * element-type declaration, so the only layer with anything to say here is
 * truthiness — which is exactly the contract's note that a `race`
 * settlement arrives already boolean where the declaration asks for it.
 *
 * Recorded honestly: a `homogeneous` or `elementShape` constraint needs the
 * whole set and so goes unchecked on a *literal* container at one of these
 * modes. `length` is checked statically against the element count, and the
 * dynamic path below runs every constraint on the real value. No core
 * operator declares the other two on a lazy container.
 */
const vetElement = (value: unknown, declared: ValidatedParameter): unknown =>
  declared.truthiness ? isTruthy(value) : value

/**
 * Handles straight off a literal container — the authored shape the parser
 * kept element- and entry-addressable. Returns false when the supplied node
 * is anything else, leaving the caller to take the degeneration path.
 */
const containerHandles = (
  supplied: CompiledNode,
  declared: ValidatedParameter,
  ctx: EvaluationContext,
  name: string,
  resolved: Record<string, unknown>
): boolean => {
  if (declared.evaluation === 'lazyElements' && supplied.kind === 'elements') {
    resolved[name] = supplied.nodes.map((element) =>
      handleOf(async () => vetElement(await evaluateNode(element, ctx), declared))
    )
    return true
  }
  if (declared.evaluation === 'race' && supplied.kind === 'elements') {
    resolved[name] = raceStream(supplied.nodes, ctx, (value) => vetElement(value, declared))
    return true
  }
  if (declared.evaluation === 'lazyEntries' && supplied.kind === 'entries') {
    // A vars block on the map scopes its branches, as on any plain literal
    const scoped = pushVars(ctx, supplied.vars)
    const entries: Record<string, LazyValue> = {}
    for (const [key, value] of Object.entries(supplied.entries))
      entries[key] = handleOf(async () => vetElement(await evaluateNode(value, scoped), declared))
    resolved[name] = entries
    return true
  }
  return false
}

/**
 * The delivery a value still owes after the ordinary layers: an unsupplied
 * lazy parameter's default, and the degeneration rule's pre-resolved
 * handles. A parameter with nothing to owe passes through untouched.
 */
const wrapDelivery = (
  value: unknown,
  declared: ValidatedParameter,
  degenerating: string | undefined
): unknown => {
  if (degenerating === 'lazyElements')
    return (value as unknown[]).map((element) => settledHandle(vetElement(element, declared)))
  if (degenerating === 'race')
    return settledStream(value as unknown[], (element) => vetElement(element, declared))
  if (degenerating === 'lazyEntries') {
    const entries: Record<string, LazyValue> = {}
    for (const [key, element] of Object.entries(value as Record<string, unknown>))
      entries[key] = settledHandle(vetElement(element, declared))
    return entries
  }
  if (declared.evaluation === 'lazy') return settledHandle(value)
  return value
}

const typeError = (
  node: OperatorNode,
  name: string,
  result: { ok: false; expected: string; actual: string }
): FigTreeError => {
  return new FigTreeError({
    code: ErrorCodes.typeCheck,
    message: `${node.name} – parameter '${name}': expected ${result.expected}, received ${result.actual}`,
    path: node.path,
    operator: node.name,
  })
}

/**
 * The declared policy, or the compiled table read through its selector. The
 * selector is read after the defaults pass, so it is the value its own
 * layers will see. Its type is checked here whatever `runtimeTypeCheck`
 * says: the table is semantics, and needs a member of the literal type as
 * its key.
 */
const effectivePolicy = (
  node: OperatorNode,
  declared: ValidatedParameter,
  resolved: Record<string, unknown>
): NullPolicyValue => {
  if (typeof declared.nullPolicy === 'string') return declared.nullPolicy
  const compiled: CompiledNullPolicy = declared.nullPolicy
  const selectorDeclared = node.entry.definition.parameters[compiled.selector]
  const selectorValue = resolved[compiled.selector]
  const typed = checkType(selectorValue, selectorDeclared.type)
  if (!typed.ok) throw typeError(node, compiled.selector, typed)
  // The table has a row per member of the literal type, and the type check
  // is membership, so a miss here is a compiler defect
  const row = compiled.table.find((entry) => entry.value === selectorValue)
  if (row === undefined)
    throw internalError(`no null-policy row for ${node.name}.${compiled.selector}`)
  return row.policy
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
