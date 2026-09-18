/**
 * The per-evaluation context and the per-node `OperatorContext` ("Merge
 * semantics" in the Options area of docs-dev/v3-specs/v3-api.md; "The
 * runtime interface" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * Options merge by the one two-level rule: by key at the top level, and
 * again by key one level down inside object-valued options; anything deeper
 * is replaced wholesale, arrays always replace, keys set to `undefined` are
 * ignored. The merged result is frozen for the call and never written back
 * to the instance.
 */
import type { FigTreeOptions } from '../options'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import type { OperatorContext } from '../runtimeInterface'
import { isPlainObject } from '../utils'
import type { Scope } from './scope'

export interface EvaluationContext {
  /** The merged instance + per-call options. */
  options: FigTreeOptions
  /** The merged evaluation data; frozen at the top level (our object). */
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
  strictDataPaths: boolean
  runtimeTypeCheck: boolean
  /** The innermost enclosing `vars` scope; absent at the root (./scope). */
  scope?: Scope
}

/**
 * The two-level merge rule, shared by `evaluate()`, `validate()` and
 * Phase 8's `updateOptions()`.
 */
export const mergeOptions = (instance: FigTreeOptions, call: FigTreeOptions): FigTreeOptions => {
  const merged: Record<string, unknown> = { ...instance }
  for (const [key, value] of Object.entries(call)) {
    if (value === undefined) continue
    const existing = merged[key]
    if (isPlainObject(value) && isPlainObject(existing)) {
      const block: Record<string, unknown> = { ...existing }
      for (const [innerKey, innerValue] of Object.entries(value)) {
        if (innerValue !== undefined) block[innerKey] = innerValue
      }
      merged[key] = block
    } else {
      merged[key] = value
    }
  }
  return merged as FigTreeOptions
}

export const createEvaluationContext = (merged: FigTreeOptions): EvaluationContext => {
  const signal = merged.signal ?? new AbortController().signal
  return {
    options: merged,
    data: Object.freeze({ ...(merged.data ?? {}) }),
    signal,
    rootSignal: signal,
    strictDataPaths: merged.strictDataPaths ?? false,
    runtimeTypeCheck: merged.runtimeTypeCheck ?? true,
  }
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

const noop = () => {}

/**
 * The context a body receives: the signal, exactly the option blocks its
 * definition declares (frozen), and the two stubs — `memo` runs the unit
 * every time until the result cache lands (Phase 9), `note` discards until
 * trace lands (Phase 12).
 */
export const createOperatorContext = (
  ctx: EvaluationContext,
  definition: ValidatedOperatorDefinition
): OperatorContext => {
  const picked: Record<string, unknown> = {}
  const options = ctx.options as Record<string, unknown>
  for (const block of definition.readsOptions) {
    if (options[block] !== undefined) picked[block] = options[block]
  }
  return {
    signal: ctx.signal,
    options: Object.freeze(picked) as Readonly<Partial<FigTreeOptions>>,
    cache: { memo: (_key, fn) => fn() },
    trace: { note: noop },
  }
}
