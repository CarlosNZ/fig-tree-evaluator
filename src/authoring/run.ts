/**
 * Rule 4 of the coverage walk ("Running a node" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): a pure operator node run
 * alone, once per combination of what its inputs are known to be. Its
 * children are never run again: each is summarised by its result.
 *
 * A run calls the operator's own body, on parameters `resolveInputs`
 * resolves as the engine's layers do, through handles and streams the run
 * owns, so it sees what the body does with each child: whether it asks for
 * it, lets its failure through, or hands it straight back. A child whose
 * value is not known is a stand-in, which has none, so a body that waits on
 * one cannot finish, and the node is not run after all. The rule checker
 * holds the runner to the engine (test/coverage-rules.test.ts).
 */
import { FigTreeError, isFigTreeError } from '../FigTreeError'
import { isOperatorFailure } from '../OperatorFailure'
import { ErrorCodes } from '../errorCodes'
import { isTruthy } from '../primitives/truthiness'
import type { FigTreeErrorCode } from '../errorCodes'
import type { OperatorNode } from '../compile/artifact'
import type { ValidatedOperatorDefinition, ValidatedParameter } from '../operatorDefinition'
import type { EvaluationOptions } from '../options'
import type { OperatorContext, Settlement } from '../runtimeInterface'
import { exactValues, exactly, fits, ofType, union } from './known'
import type { Known } from './known'
import { judge, resolveInputs, vetted } from './inputs'
import type { Failure } from './findings'
import { answerRule, rulesOf } from './rules'
import type { RuleOptions } from './rules'
import type { NodeResult } from './walk'

/**
 * A child the body may ask for: a lazy parameter's, an element or entry of
 * a literal container at a container-lazy parameter, or an `each`, walked
 * once or once per element.
 */
export interface Child {
  param: string
  /** The element's index or the entry's key; an `each`'s element's index */
  at?: number | string
  result: NodeResult
}

/** What the runs of a node show. */
export interface Ran {
  /** What the node returns, over every run */
  output: Known
  /** Its own failures: certain for a code every run failed with */
  failures: Failure[]
  /** The children some run evaluated */
  reached: Set<Child>
  /**
   * The children some run waited on: all those reached but a race's elements
   * and an `each`'s, which the engine starts whether the body needs them or
   * not
   */
  awaited: Set<Child>
  /** The children whose failure some run let through, or handed back */
  escaped: Set<Child>
  /** The children some run handed straight back as its answer */
  passed: Set<Child>
  /** Whether every run failed */
  fails: boolean
}

/** The most runs a node is given: as many values as the walk keeps exactly. */
const RUN_LIMIT = 16

/**
 * How long an async body is given to settle, in ms. A body still waiting
 * after this waits on something the analysis cannot give it: a host's own
 * state, a signal that never aborts. Core bodies settle within microtasks.
 */
const SETTLE_LIMIT = 100

/** Definitions whose body did not settle in time, in one analysis. */
export type Stalled = Set<ValidatedOperatorDefinition>

/** What a child comes to in one run. */
type Outcome = { value: unknown } | { fails: true } | { unknown: true }

const UNKNOWN: Outcome = { unknown: true }
const FAILS: Outcome = { fails: true }

/** How one run ended. */
type Ending = { value: unknown } | { failure: Failure } | { escaped: Child } | { passed: Child }

/**
 * What a child can come to: each value it is known to be, and its failure
 * where it may fail. A child whose value is not known is a stand-in, which
 * covers its failure too. A `replacesNullAt` holder is asked for by the
 * layers rather than the body, so it is never run failing: it is a stand-in
 * unless it is known and cannot fail.
 */
const outcomesOf = (child: Child, declared: ValidatedParameter): Outcome[] => {
  const { verdict, output } = child.result
  const holder = declared.replacesNullAt !== undefined
  if (verdict === 'always') return [holder ? UNKNOWN : FAILS]
  const values = exactValues(output)
  if (values === undefined) return [UNKNOWN]
  const known = values.map((value) => ({ value }))
  if (verdict === 'no') return known
  return holder ? [UNKNOWN] : [...known, FAILS]
}

/**
 * The node's runs, or nothing where it cannot be run: an eager input not
 * known exactly, too many combinations, a body that waits on a stand-in, or
 * one that does not settle in time, which is then not run again in the same
 * analysis. `outputs` holds what each parameter's child returns, as the walk
 * gives them to `resolveInputs`; `children` the ones delivered to the body
 * to ask for.
 */
export const runNode = async (
  node: OperatorNode,
  outputs: Record<string, Known>,
  children: Child[],
  options: RuleOptions,
  stalled: Stalled = new Set()
): Promise<Ran | undefined> => {
  if (stalled.has(node.entry.definition)) return undefined
  const { parameters } = node.entry.definition
  const handed = new Set(children.map((child) => child.param))
  const values: { name: string; outcomes: Outcome[] }[] = []
  for (const [name, known] of Object.entries(outputs)) {
    if (handed.has(name)) continue
    const exact = exactValues(known)
    if (exact === undefined) return undefined
    values.push({ name, outcomes: exact.map((value) => ({ value })) })
  }
  const asked = children.map((child) => {
    const declared = parameters[child.param]
    const outcomes = outcomesOf(child, declared)
    // An `each` walked once comes to the same for every element, as far as
    // the walk knows
    const once = declared.evaluation === 'perElement' && child.at === undefined
    return { child, outcomes: once && outcomes.length > 1 ? [UNKNOWN] : outcomes }
  })
  const count = () =>
    [...values, ...asked].reduce((product, { outcomes }) => product * outcomes.length, 1)
  // Too many: a child that could come to several things is a stand-in
  if (count() > RUN_LIMIT)
    for (const each of asked) if (each.outcomes.length > 1) each.outcomes = [UNKNOWN]
  const total = count()
  if (total > RUN_LIMIT) return undefined

  const reached = new Set<Child>()
  const awaited = new Set<Child>()
  const endings: Ending[] = []
  for (let i = 0; i < total; i++) {
    let index = i
    const pick = (outcomes: Outcome[]) => {
      const outcome = outcomes[index % outcomes.length]
      index = Math.floor(index / outcomes.length)
      return outcome
    }
    const exact: Record<string, unknown> = {}
    for (const { name, outcomes } of values)
      exact[name] = (pick(outcomes) as { value: unknown }).value
    const chosen = new Map(asked.map(({ child, outcomes }) => [child, pick(outcomes)]))
    const ending = await runOnce(node, outputs, exact, chosen, options, reached, awaited, stalled)
    if (ending === undefined) return undefined
    endings.push(ending)
  }

  const output: Known[] = []
  const counts = new Map<string, { failure: Failure; count: number }>()
  const escaped = new Set<Child>()
  const passed = new Set<Child>()
  let failed = 0
  for (const ending of endings) {
    if ('value' in ending) output.push(exactly(ending.value))
    else if ('passed' in ending) {
      const { passed: child } = ending
      passed.add(child)
      escaped.add(child)
      output.push(handedBack(child, parameters[child.param]))
    } else {
      failed++
      if ('escaped' in ending) escaped.add(ending.escaped)
      else {
        const key = `${ending.failure.code}|${ending.failure.parameter ?? ''}`
        const seen = counts.get(key) ?? { failure: ending.failure, count: 0 }
        seen.count++
        counts.set(key, seen)
      }
    }
  }
  const failures = [...counts.values()].map(({ failure, count }): Failure => ({
    ...failure,
    certainty: count === endings.length ? 'always' : 'may',
  }))
  return {
    output: union(...output),
    failures,
    reached,
    awaited,
    escaped,
    passed,
    fails: failed === endings.length,
  }
}

/**
 * What a child handed back gives the node: vetted, as on any demand, where
 * an element is judged for truthiness only.
 */
const handedBack = (child: Child, declared: ValidatedParameter): Known =>
  child.at === undefined || declared.evaluation === 'perElement'
    ? vetted(declared, child.result.output)
    : declared.truthiness
      ? ofType('boolean')
      : child.result.output

const STOPPED = Symbol('stopped')

const NEVER = new Promise<never>(() => {})

/** A rejection the run marks handled, as the engine does its own. */
const rejected = (error: unknown): Promise<never> => {
  const promise = Promise.reject(error)
  promise.catch(() => {})
  return promise
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function'

const PASSTHROUGH_CACHE: OperatorContext['cache'] = { memo: (_key, fn) => fn() }
const SILENT_TRACE: OperatorContext['trace'] = { note: () => {} }

/**
 * One run: the layers on this combination, then the body, through handles
 * and streams that record what it asks for. Nothing where the body waits on
 * a stand-in, unless it hands the stand-in's own promise straight back.
 */
const runOnce = async (
  node: OperatorNode,
  outputs: Record<string, Known>,
  exact: Record<string, unknown>,
  chosen: Map<Child, Outcome>,
  options: RuleOptions,
  reached: Set<Child>,
  awaited: Set<Child>,
  stalled: Stalled
): Promise<Ending | undefined> => {
  /** A child whose value or failure the run waits on. */
  const waitOn = (child: Child) => {
    reached.add(child)
    awaited.add(child)
  }
  const { definition } = node.entry
  const { parameters } = definition
  const given: Record<string, Known> = { ...outputs }
  for (const [name, value] of Object.entries(exact)) given[name] = exactly(value)
  for (const [child, outcome] of chosen)
    if (parameters[child.param].replacesNullAt !== undefined && 'value' in outcome)
      given[child.param] = exactly(outcome.value)
  const inputs = resolveInputs(node, given)

  for (const [child, outcome] of chosen) {
    const declared = parameters[child.param]
    // The engine starts a race's every element before the layers run
    if (declared.evaluation === 'race') reached.add(child)
    if (!inputs.consulted.has(child.param)) continue
    // A holder the layers ask for, with no value to give
    if (!('value' in outcome)) return undefined
    waitOn(child)
  }
  // The parameter a failure is about: the one a type check names, else the
  // one a rule with its code names, where that rule holds here
  const rules = rulesOf(definition)
  const own = (code: FigTreeErrorCode, message: string, named?: string): Ending => {
    const parameter =
      named ??
      (rules === 'external'
        ? undefined
        : rules.find(
            (rule) =>
              rule.code === code &&
              rule.parameter !== undefined &&
              answerRule(node, rule, inputs, options) !== 'no'
          )?.parameter)
    return {
      failure: {
        path: node.path,
        code,
        message,
        certainty: 'always',
        operator: node.name,
        ...(parameter !== undefined ? { parameter } : {}),
        order: [node.order],
      },
    }
  }
  if (inputs.ends === 'null') return { value: null }
  if (inputs.ends !== undefined) return { failure: inputs.ends }

  const standIns = new Map<unknown, Child>()
  const made = new Set<unknown>()
  const markers = new Map<unknown, Child>()
  const typeChecks = new Map<unknown, string>()
  // Whether the body waits on a stand-in: before it has answered, noted;
  // after, the run stops
  let waited = false
  let stop = () => {}
  const stopped = new Promise<typeof STOPPED>((resolve) => {
    stop = () => resolve(STOPPED)
  })
  let awaiting = false
  const waitOnUnknown = () => {
    if (awaiting) stop()
    else waited = true
  }

  const marker = (child: Child) => {
    const error = new FigTreeError({ code: ErrorCodes.operatorFailure, message: '', path: [] })
    markers.set(error, child)
    return error
  }
  const vetParameter =
    (name: string, declared: ValidatedParameter) =>
    (value: unknown): unknown => {
      const policy = declared.elementNullPolicy !== undefined
      if (fits(exactly(value), declared.type, declared.constraints, policy) !== 'yes') {
        const error = new FigTreeError({
          code: ErrorCodes.typeCheck,
          message: `${node.name} – parameter '${name}': fails its type check`,
          path: [],
        })
        typeChecks.set(error, name)
        throw error
      }
      return declared.truthiness ? judge(value, declared.type) : value
    }
  const vetElement =
    (declared: ValidatedParameter) =>
    (value: unknown): unknown =>
      declared.truthiness ? isTruthy(value) : value

  /**
   * What the body gets on asking for a child: a stand-in for an element the
   * walk has none for.
   */
  const answer = (child: Child | undefined, vet: (value: unknown) => unknown): Promise<unknown> => {
    if (child !== undefined) waitOn(child)
    const outcome = child === undefined ? UNKNOWN : chosen.get(child)!
    if ('unknown' in outcome) {
      const pending = new Promise<never>(() => {})
      if (child !== undefined) standIns.set(pending, child)
      waitOnUnknown()
      return pending
    }
    if ('fails' in outcome) return rejected(marker(child!))
    try {
      return Promise.resolve(vet(outcome.value))
    } catch (error) {
      return rejected(error)
    }
  }
  const handle = (evaluate: () => Promise<unknown>) => {
    let asked: Promise<unknown> | undefined
    const lazy = { evaluate: () => (asked ??= evaluate()) }
    made.add(lazy)
    return lazy
  }
  type Item = { index: number; child?: Child; value?: unknown }
  /** Known elements first, in index order; then any stand-in, never. */
  const stream = (items: Item[], vet: (value: unknown) => unknown) => {
    const settle = ({ index, child, value }: Item): Settlement => {
      if (child === undefined) return { index, ok: true, value: vet(value) }
      waitOn(child)
      const outcome = chosen.get(child)!
      if ('fails' in outcome) return { index, ok: false, error: marker(child) }
      try {
        return { index, ok: true, value: vet((outcome as { value: unknown }).value) }
      } catch (error) {
        return { index, ok: false, error }
      }
    }
    const isUnknown = (item: Item) =>
      item.child !== undefined && 'unknown' in chosen.get(item.child)!
    const settlements = {
      length: items.length,
      async *[Symbol.asyncIterator]() {
        for (const item of items) if (!isUnknown(item)) yield settle(item)
        if (!items.some(isUnknown)) return
        waitOnUnknown()
        await NEVER
      },
    }
    made.add(settlements)
    return settlements
  }

  /** A value that has passed its layers, delivered as its mode has it. */
  const whole = (value: unknown, declared: ValidatedParameter): unknown => {
    const vet = vetElement(declared)
    switch (declared.evaluation) {
      case 'lazyElements':
        return (value as unknown[]).map((element) => handle(() => Promise.resolve(vet(element))))
      case 'race':
        return stream(
          (value as unknown[]).map((element, index) => ({ index, value: element })),
          vet
        )
      case 'lazyEntries': {
        const entries: Record<string, unknown> = {}
        for (const [key, element] of Object.entries(value as Record<string, unknown>))
          entries[key] = handle(() => Promise.resolve(vet(element)))
        return entries
      }
      case 'lazy':
        return handle(() => Promise.resolve(value))
      default:
        return value
    }
  }

  const byParam = new Map<string, Child[]>()
  for (const child of chosen.keys())
    byParam.set(child.param, [...(byParam.get(child.param) ?? []), child])
  const params: Record<string, unknown> = {}
  for (const [name, declared] of Object.entries(parameters)) {
    if (declared.evaluation === 'perElement' || declared.replacesNullAt !== undefined) continue
    const children = byParam.get(name)
    if (children !== undefined) {
      const vet = vetElement(declared)
      if (declared.evaluation === 'lazy')
        params[name] = handle(() => answer(children[0], vetParameter(name, declared)))
      else if (declared.evaluation === 'race')
        params[name] = stream(
          children.map((child, index) => ({ index, child })),
          vet
        )
      else if (declared.evaluation === 'lazyElements')
        params[name] = children.map((child) => handle(() => answer(child, vet)))
      else {
        const entries: Record<string, unknown> = {}
        for (const child of children) entries[String(child.at)] = handle(() => answer(child, vet))
        params[name] = entries
      }
      continue
    }
    const known = inputs.received[name]
    if (known === undefined) continue
    const value = exactValues(known)
    if (value === undefined || value.length !== 1) return undefined
    params[name] = whole(value[0], declared)
  }

  for (const [name, declared] of definition.resolution.perElement) {
    if (node.params[name] === undefined || declared.over === undefined) continue
    const children = byParam.get(name) ?? []
    const over = params[declared.over]
    const collection = Array.isArray(over) ? over : []
    // Walked once for every element, or once for each element it is given
    const once = children.length === 1 && children[0].at === undefined
    if (!once && children.length !== collection.length) return undefined
    // An index the input does not have gets a stand-in
    const childAt = (index: number): Child | undefined =>
      children[once ? (index >= 0 && index < collection.length ? 0 : -1) : index]
    const vet = vetParameter(name, declared)
    const asked = new Map<number, Promise<unknown>>()
    const each = {
      evaluate: (index: number) => {
        let pending = asked.get(index)
        if (pending === undefined) asked.set(index, (pending = answer(childAt(index), vet)))
        return pending
      },
      settle: () => {
        const items = collection.map((_element, index) => ({ index, child: childAt(index)! }))
        // The engine starts every element at once
        for (const { child } of items) reached.add(child)
        return stream(items, vet)
      },
    }
    made.add(each)
    params[name] = each
  }

  const context: OperatorContext = {
    options: options.evaluation as Readonly<EvaluationOptions>,
    get signal() {
      return new AbortController().signal
    },
    cache: PASSTHROUGH_CACHE,
    trace: SILENT_TRACE,
  }

  /** A throw as the engine classifies it (`wrapFailure`). */
  const thrown = (error: unknown): Ending => {
    const child = markers.get(error)
    if (child !== undefined) return { escaped: child }
    if (isFigTreeError(error)) return own(error.code, error.message, typeChecks.get(error))
    const message = `${node.name} – ${error instanceof Error ? error.message : String(error)}`
    return own(
      (isOperatorFailure(error) ? error.code : undefined) ?? ErrorCodes.operatorFailure,
      message
    )
  }

  let result: unknown
  try {
    result = definition.evaluate(params as never, context)
  } catch (error) {
    return thrown(error)
  }
  if (isThenable(result)) {
    const passed = standIns.get(result)
    if (passed !== undefined) return { passed }
    if (waited) return undefined
    awaiting = true
    const timer = setTimeout(() => {
      stalled.add(definition)
      stop()
    }, SETTLE_LIMIT)
    const settled = await Promise.race([
      Promise.resolve(result).then(
        (value) => ({ value }),
        (error: unknown) => ({ error })
      ),
      stopped,
    ])
    clearTimeout(timer)
    if (settled === STOPPED) return undefined
    if ('error' in settled) return thrown(settled.error)
    result = settled.value
  }
  // The result boundary (`normalizeResult` in src/evaluate/operator.ts)
  if (result === undefined) return { value: null }
  if (typeof result === 'number' && !Number.isFinite(result))
    return own(
      ErrorCodes.nonFiniteResult,
      `${node.name} – produced a non-finite number (${String(result)})`
    )
  if (made.has(result))
    return own(
      ErrorCodes.escapedHandle,
      `${node.name} – returned a lazy handle instead of evaluating it`
    )
  return { value: result }
}
