/**
 * The per-evaluation context and the per-node `OperatorContext` ("Merge
 * semantics" in the Options area of docs-dev/v3-specs/v3-api.md; "The
 * runtime interface" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * Instance options merge by the two-level rule: by key at the top level,
 * and again by key one level down inside plain-data-object-valued options;
 * anything deeper is replaced wholesale, keys set to `undefined` are
 * ignored. Only plain data objects merge — an array, a class instance, an
 * `AbortSignal` or a `CacheStore` replaces as a unit, because merging one
 * key-by-key would spread away everything that makes it what it is. The
 * one block outside the rule is `data`, which is request state rather
 * than configuration: it replaces, and is held by reference.
 *
 * Two levels is also the depth at which `getOptions()` copies, so the two
 * operations agree on what is the instance's own. Nothing is frozen, per
 * call or otherwise: the promise that an evaluation never mutates the
 * instance or the caller's objects is pinned by the test suite, where it
 * costs nothing per call, rather than by a per-call walk that could only
 * ever reach one level.
 */
import type { EvaluationOptions, FigTreeOptions } from '../options'
import type { CompiledNode } from '../parse'
import type { ResultStore } from '../resultCache'
import type { OperatorContext, TraceEvent } from '../runtimeInterface'
import { isPlainDataObject, noop } from '../utils'
import type { TraceNode } from '../trace'
import type { AbortScope } from './abort'
import type { Bindings } from './bindings'
import { bodyMemo } from './memo'
import type { TraceRecorder } from './trace'
import type { Scope } from './scope'

export interface EvaluationContext {
  /** The merged instance + per-call options, registry keys stripped. */
  options: EvaluationOptions
  /**
   * The evaluation data — the same object as `options.data`, so a body
   * and the `$data` resolver read one block. It is the host's own object,
   * by reference: the call's block if it supplied one, else the
   * instance's.
   */
  data: Readonly<Record<string, unknown>>
  /**
   * This node's effective cancellation scope: the root's, plus every
   * enclosing node scope (./abort). Read at the node boundary for
   * `aborted`; its `signal` is materialised only for a consumer that
   * needs a real one.
   */
  abortScope: AbortScope
  /**
   * The kill switch alone — the root scope, which composes the caller's
   * `signal` and the evaluation `timeout` (./run.ts), with no enclosing
   * node scope mixed in. The two are told apart because they mean
   * opposite things: a scope abort is silent and its branch is simply
   * abandoned, while a kill-switch abort is the caller's decision and cuts
   * through every fallback. At the root the two fields hold one scope.
   */
  rootScope: AbortScope
  /**
   * The instance's result store. Carried on the context because it is
   * constant for the whole evaluation, like `options` and `rootScope` —
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
 * The two-level merge rule for instance options — construction and
 * `updateOptions()`. Per-call options do not come through here: they are
 * a flat override of five request-scoped keys (src/FigTree.ts).
 *
 * An incoming configuration block is rebuilt rather than stored by
 * reference, even where the instance has no counterpart to merge it with,
 * so a host that goes on editing its own `http` object does not edit the
 * instance. `data` is the exception: it is the host's state, not the
 * instance's configuration, so it replaces and is held by reference.
 */
export const mergeOptions = (instance: FigTreeOptions, update: FigTreeOptions): FigTreeOptions => {
  const merged: Record<string, unknown> = { ...instance }
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) continue
    if (key === 'data' || !isPlainDataObject(value)) {
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

/**
 * The data block of an evaluation that supplied none. One shared object,
 * so it is frozen — the one freeze in the evaluation path, guarding
 * engine-owned state rather than the caller's.
 */
const NO_DATA: Readonly<Record<string, unknown>> = Object.freeze({})

/**
 * The context an evaluation starts from. `root` is the root scope — the
 * caller's `signal` composed with the `timeout`, or a deferred scope with
 * neither — and is built by the caller (./run.ts), because its lifetime is
 * the evaluation's and this module only describes the record. `options`
 * is carried as handed in: the instance's own prepared object when the
 * call supplied nothing, so the common case allocates only this record.
 */
export const createEvaluationContext = (
  options: EvaluationOptions,
  cache: ResultStore,
  root: AbortScope,
  trace?: TraceRecorder
): EvaluationContext => ({
  options,
  data: options.data ?? NO_DATA,
  abortScope: root,
  rootScope: root,
  cache,
  strictDataPaths: options.strictDataPaths ?? false,
  runtimeTypeCheck: options.runtimeTypeCheck ?? true,
  ...(trace !== undefined ? { trace } : {}),
})

/**
 * The context a body receives: the signal, the evaluation's options, the
 * live `memo`, and `note`. One allocation per node — the two wrappers a
 * body reads through are shared constants unless the node is caching or
 * the evaluation is tracing, in which case that one is built for real.
 *
 * `signal` is a getter on the prototype: reading it materialises the
 * node's scope into a real `AbortSignal` (./abort), so a body that never
 * touches it — most of them — costs the evaluation no controller, and no
 * closure is built to hold the scope.
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
  operator: string,
  useCache: boolean
): OperatorContext => {
  const note = noteChannel(ctx)
  return new BodyContext(
    ctx.abortScope,
    ctx.options,
    useCache ? { memo: bodyMemo({ operator, useCache, note }, ctx.cache) } : PASSTHROUGH_CACHE,
    note === noop ? SILENT_TRACE : { note }
  )
}

class BodyContext implements OperatorContext {
  readonly #scope: AbortScope

  constructor(
    scope: AbortScope,
    readonly options: EvaluationOptions,
    readonly cache: OperatorContext['cache'],
    readonly trace: OperatorContext['trace']
  ) {
    this.#scope = scope
  }

  get signal(): AbortSignal {
    return this.#scope.signal
  }
}

/** `memo` for a node that is not caching: runs the work, keeps nothing. */
const PASSTHROUGH_CACHE: OperatorContext['cache'] = { memo: (_key, fn) => fn() }

/**
 * `note` for an evaluation that is not tracing: discards, so a body emits
 * unconditionally.
 */
const SILENT_TRACE: OperatorContext['trace'] = { note: noop }

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
