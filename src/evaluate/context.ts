/**
 * The per-evaluation context and the per-node `OperatorContext` ("Merge
 * semantics" in the Options area of docs-dev/v3-specs/v3-api.md; "The
 * runtime interface" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * Options merge by the one two-level rule: by key at the top level, and
 * again by key one level down inside plain-data-object-valued options;
 * anything deeper is replaced wholesale, keys set to `undefined` are
 * ignored. Only plain data objects merge — an array, a class instance, an
 * `AbortSignal` or a `CacheStore` replaces as a unit, because merging one
 * key-by-key would spread away everything that makes it what it is.
 *
 * Two levels is also the depth at which options are copied and frozen, so
 * the three operations agree: `copyOptions` makes every block the
 * instance's own, `mergeOptions` never hands back a caller's block, and
 * the freeze in `createEvaluationContext` can therefore reach every block
 * without ever touching an object the host still owns.
 */
import type { EvaluationOptions, FigTreeOptions } from '../options'
import type { CompiledNode } from '../parse'
import type { ResultStore } from '../resultCache'
import type { OperatorContext, TraceEvent } from '../runtimeInterface'
import { isPlainDataObject } from '../utils'
import type { TraceNode } from '../trace'
import type { Bindings } from './bindings'
import { bodyMemo, type MemoBinding } from './memo'
import type { TraceRecorder } from './trace'
import type { Scope } from './scope'

export interface EvaluationContext {
  /** The merged instance + per-call options, registry keys stripped. */
  options: EvaluationOptions
  /**
   * The merged evaluation data — the same object as `options.data`, so a
   * body and the `$data` resolver read one block. Frozen when it is a
   * plain data block (ours, rebuilt by the merge); a class instance is the
   * host's own object and is neither copied nor frozen.
   */
  data: Readonly<Record<string, unknown>>
  /** This node's effective signal: the root's, plus enclosing scopes. */
  signal: AbortSignal
  /**
   * The kill switch alone — the root scope's signal, which composes the
   * caller's `signal` and the evaluation `timeout` (./run.ts), with no
   * enclosing node scope mixed in. The two are told apart because they
   * mean opposite things: a scope abort is silent and its branch is simply
   * abandoned, while a kill-switch abort is the caller's decision and cuts
   * through every fallback. At the root the two fields hold one signal.
   */
  rootSignal: AbortSignal
  /**
   * The instance's result store. Carried on the context because it is
   * constant for the whole evaluation, like `options` and `rootSignal` —
   * threading it through every recursion site would deliver nothing that
   * varies.
   */
  cache: ResultStore
  strictDataPaths: boolean
  runtimeTypeCheck: boolean
  /** The innermost enclosing `vars` scope; absent at the root (./scope). */
  scope?: Scope
  /**
   * The innermost enclosing iterator binding; absent outside any `each`
   * subtree (./bindings). A separate chain from `scope`, because a binding
   * frame lives for one element where a vars scope lives for a node.
   */
  bindings?: Bindings
  /**
   * The arguments of the fragment call whose body is running: one thunk per
   * DECLARED parameter, absent outside a body (./fragment).
   *
   * A frame, not a chain — unlike `scope` and `bindings`. A fragment body
   * is sealed, so a nested call replaces this rather than nesting under it,
   * and the recursion ban means a body can never be its own ancestor.
   */
  params?: ParamsFrame
  /**
   * Wrapped around each of the artifact ROOT's holes, where report mode
   * or a shielded timeout asked for one (./run.ts builds it). Consumed
   * exactly once, by the root skeleton, which clears it for everything
   * below: degradation and shielded assembly are defined on the hole —
   * the maximal evaluable node — and a nested skeleton's holes are
   * already inside one.
   */
  rootBoundary?: HoleBoundary
  /**
   * The trace recorder, present only when `trace` was asked for — its
   * absence IS the fast path, checked once per node.
   */
  trace?: TraceRecorder
  /**
   * This node's own trace entry, which its children attach to. Set by
   * the dispatch before it descends, so a var's definition lands under
   * the node that DECLARED it rather than under whichever node first
   * demanded it — `pushVars` builds its thunks over the declaring
   * context, so this needs no special handling anywhere.
   */
  traceParent?: TraceNode
  /**
   * The fragment body this node belongs to, absent in the input's own
   * expression. It is what a failure is attributed to (./fragment): the
   * fragment's name, and the path of the call IN THE INPUT — inherited
   * through nested calls, since an inner call node's own path resolves
   * inside a body rather than in the input.
   */
  frame?: FragmentFrame
}

/**
 * Wrapped around one root hole's evaluation, addressing the hole by its
 * node — the one object the artifact's hole list and the root skeleton's
 * share. Declared here, beside the field that holds it, so the context
 * does not have to import from the module that builds it.
 */
export type HoleBoundary = (run: () => Promise<unknown>, node: CompiledNode) => Promise<unknown>

/** Declared parameter name → its evaluate-at-most-once resolved value. */
export type ParamsFrame = ReadonlyMap<string, () => Promise<unknown>>

/** Where a failure inside a fragment body is to be attributed. */
export interface FragmentFrame {
  fragment: string
  callPath: (string | number)[]
}

/**
 * The two-level merge rule, shared by `evaluate()`, `validate()` and
 * `updateOptions()` — one rule, so an option means the same thing
 * wherever it is supplied.
 *
 * An incoming block is always rebuilt rather than stored by reference,
 * even where the instance has no counterpart to merge it with: the result
 * gets frozen per evaluation, and freezing an object the caller still
 * holds would reach outside the library.
 */
export const mergeOptions = (instance: FigTreeOptions, call: FigTreeOptions): FigTreeOptions => {
  const merged: Record<string, unknown> = { ...instance }
  for (const [key, value] of Object.entries(call)) {
    if (value === undefined) continue
    if (!isPlainDataObject(value)) {
      merged[key] = value
      continue
    }
    const existing = merged[key]
    const block: Record<string, unknown> = isPlainDataObject(existing) ? { ...existing } : {}
    for (const [innerKey, innerValue] of Object.entries(value)) {
      if (innerValue !== undefined) block[innerKey] = innerValue
    }
    merged[key] = block
  }
  return merged as FigTreeOptions
}

/**
 * A defensive copy at the merge rule's depth: a fresh top level and a
 * fresh copy of every plain data block, so nothing the instance holds is
 * still reachable from the object a caller passed in (or gets back).
 *
 * Level three and below is shared by reference, deliberately. A caller's
 * `data` values are theirs and results may share structure with them, and
 * an `AbortSignal` or a `CacheStore` cannot be cloned at all.
 */
export const copyOptions = <T extends FigTreeOptions>(options: T): T => {
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(options)) {
    copy[key] = isPlainDataObject(value) ? { ...value } : value
  }
  return copy as T
}

/** The data block of an evaluation that supplied none. */
const NO_DATA: Readonly<Record<string, unknown>> = Object.freeze({})

/**
 * The context an evaluation starts from. `signal` is the root scope's —
 * the caller's `signal` composed with the `timeout` — and is built by the
 * caller (./run.ts), because its lifetime is the evaluation's and this
 * module only describes the record.
 */
export const createEvaluationContext = (
  merged: EvaluationOptions,
  cache: ResultStore,
  signal: AbortSignal,
  trace?: TraceRecorder
): EvaluationContext => {
  const options = freezeOptions(merged)
  return {
    options,
    data: options.data ?? NO_DATA,
    signal,
    rootSignal: signal,
    cache,
    strictDataPaths: merged.strictDataPaths ?? false,
    runtimeTypeCheck: merged.runtimeTypeCheck ?? true,
    ...(trace !== undefined ? { trace } : {}),
  }
}

/**
 * Frozen at the merge rule's depth, matching the copy above: the object
 * and each of its blocks. Every block is instance-owned by the time this
 * runs, so the freeze never reaches a caller's object. A caller's `data`
 * values sit a level deeper and stay writable.
 */
const freezeOptions = <T extends FigTreeOptions>(options: T): T => {
  for (const value of Object.values(options)) {
    if (isPlainDataObject(value)) Object.freeze(value)
  }
  return Object.freeze(options)
}

/**
 * The context a body receives: the signal, the evaluation's frozen options,
 * the live `memo`, and `note`, which discards until trace lands (Phase 12).
 *
 * The binding is passed rather than the node, because both fields it holds
 * are already computed one frame up and this module has no business
 * knowing what a node is.
 *
 * Options reach a body whole. There is nothing privileged in them to hide,
 * and a per-definition declaration of which blocks a body reads could only
 * record an intention, never police one — an operator that wanted a block
 * would simply name it. A body whose result depends on an option it reads
 * owns that dependency in its cache key, which means `cache: 'manual'`
 * ("Caching" in docs-dev/v3-specs/v3-operator-contract.md); the `'auto'`
 * key covers resolved parameters only.
 */
export const createOperatorContext = (
  ctx: EvaluationContext,
  binding: MemoBinding
): OperatorContext => {
  const note = noteChannel(ctx)
  return {
    signal: ctx.signal,
    options: ctx.options,
    cache: { memo: bodyMemo({ ...binding, note }, ctx.cache) },
    trace: { note },
  }
}

/** Discards while trace is off, so a body emits unconditionally. */
const noop = () => {}

/**
 * The live `note`: events land on the node's OWN entry, which the
 * dispatch has already made this context's `traceParent`.
 */
export const noteChannel = (ctx: EvaluationContext): ((event: TraceEvent) => void) => {
  const { trace, traceParent } = ctx
  if (trace === undefined || traceParent === undefined) return noop
  return (event) => {
    trace.note(traceParent, event)
  }
}
