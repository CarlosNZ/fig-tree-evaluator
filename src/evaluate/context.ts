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
  signal: AbortSignal
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

export const createEvaluationContext = (merged: FigTreeOptions): EvaluationContext => ({
  options: merged,
  data: Object.freeze({ ...(merged.data ?? {}) }),
  signal: merged.signal ?? new AbortController().signal,
  strictDataPaths: merged.strictDataPaths ?? false,
  runtimeTypeCheck: merged.runtimeTypeCheck ?? true,
})

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
