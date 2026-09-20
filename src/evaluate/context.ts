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
import type { ResultStore } from '../resultCache'
import type { OperatorContext } from '../runtimeInterface'
import { isPlainDataObject } from '../utils'
import type { Bindings } from './bindings'
import { bodyMemo, type MemoBinding } from './memo'
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
  /** This node's effective signal: the caller's, plus enclosing scopes. */
  signal: AbortSignal
  /**
   * The kill switch alone — the caller's `signal` and (Phase 10) the
   * evaluation deadline, with no enclosing node scope mixed in. The two
   * are told apart because they mean opposite things: a scope abort is
   * silent and its branch is simply abandoned, while a kill-switch abort
   * is the caller's decision and cuts through every fallback.
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

export const createEvaluationContext = (
  merged: EvaluationOptions,
  cache: ResultStore
): EvaluationContext => {
  const signal = merged.signal ?? new AbortController().signal
  const options = freezeOptions(merged)
  return {
    options,
    data: options.data ?? NO_DATA,
    signal,
    rootSignal: signal,
    cache,
    strictDataPaths: merged.strictDataPaths ?? false,
    runtimeTypeCheck: merged.runtimeTypeCheck ?? true,
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
 * A node's own abort scope: a controller chained to the enclosing signal,
 * which the node wrapper aborts once its body settles. "Resolution is
 * cancellation" — anything the body did not wait for stops.
 *
 * Chained by hand rather than with `AbortSignal.any`: that is Node 22 and
 * a much more recent browser floor (Chrome 116, Safari 17.4) than this
 * package should ask for. The listener is removed on settle, so a
 * long-lived caller signal does not accumulate one per node evaluated.
 *
 * Honest about reach: JS cannot interrupt code already running, so an
 * abandoned subtree runs to completion and has its result discarded. What
 * the abort does reliably is stop work that has not *started*, and stop
 * anything holding the signal — which is the I/O clients, and where the
 * time actually lives.
 */
export const childScope = (parent: AbortSignal): { signal: AbortSignal; settle: () => void } => {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const forward = () => controller.abort(parent.reason)
  parent.addEventListener('abort', forward, { once: true })
  return {
    signal: controller.signal,
    settle: () => {
      parent.removeEventListener('abort', forward)
      controller.abort(SCOPE_SETTLED)
    },
  }
}

/** The reason a scope abort carries, distinguishing it from a kill switch. */
export const SCOPE_SETTLED = 'fig-tree:scope-settled'

/** The reason a per-request deadline carries, distinguishing it from both. */
export const REQUEST_EXPIRED = 'fig-tree:request-expired'

export interface RequestDeadline {
  /** The signal a body (and the client it holds) sees. */
  signal: AbortSignal
  /** Rejects when the deadline passes; raced against the body. */
  expiry: Promise<never>
  /** True once the timer has fired — how the wrapper classifies the throw. */
  expired: () => boolean
  settle: () => void
}

/**
 * A node's per-request deadline (ledger #15): the node's own `timeout`
 * parameter, composed onto the signal its body receives.
 *
 * Chained onto the enclosing signal exactly as `childScope` is, with two
 * differences that carry the whole feature. It fires on its own, rather
 * than only when something upstream aborts. And its expiry is an ORDINARY
 * failure — the per-node network-flakiness guard, caught by the node's
 * `fallback` — where a scope abort is silent abandonment and the caller's
 * signal cuts through everything.
 *
 * `expiry` exists because a signal alone cannot end a wait: a driver that
 * cannot abort (SQLite's synchronous API) would hold the node past its
 * deadline forever. So the wrapper races the body against this promise.
 * Cancellation is best-effort; the deadline is not.
 */
export const requestDeadline = (parent: AbortSignal, ms: number): RequestDeadline => {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const forward = () => controller.abort(parent.reason)
  parent.addEventListener('abort', forward, { once: true })

  let fired = false
  let expire!: (reason: unknown) => void
  const expiry = new Promise<never>((_resolve, reject) => (expire = reject))
  // Attached where the promise is created, which is the only point early
  // enough: when the body wins the race nobody ever awaits this, and a
  // runtime reports an unhandled rejection at the microtask checkpoint
  expiry.catch(() => {})

  const timer = setTimeout(() => {
    fired = true
    controller.abort(REQUEST_EXPIRED)
    expire(REQUEST_EXPIRED)
  }, ms)

  return {
    signal: controller.signal,
    expiry,
    expired: () => fired,
    settle: () => {
      clearTimeout(timer)
      parent.removeEventListener('abort', forward)
    },
  }
}

const noop = () => {}

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
): OperatorContext => ({
  signal: ctx.signal,
  options: ctx.options,
  cache: { memo: bodyMemo(binding, ctx.cache) },
  trace: { note: noop },
})
