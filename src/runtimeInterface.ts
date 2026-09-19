/**
 * The runtime interface an operator body is written against ("The runtime
 * interface" in docs-dev/v3-specs/v3-operator-contract.md): the handle
 * types the delivery modes produce, the settlement shape `race` streams,
 * and `OperatorContext`. Interfaces early, features behind them
 * (implementation-plan working rule 3): every shape here is final from
 * Phase 4, while `cache.memo` (Phase 9), `trace.note` (Phase 12), the
 * handles (Phases 5–6) and signal composition (Phase 10) light up later
 * without reshaping what bodies see.
 */
import type { FigTreeOptions } from './options'

/**
 * The brand every engine-made handle carries. Internal (never
 * barrel-exported): its one consumer besides the engine is the
 * escaped-handle guard, which fails a body that returns a handle instead of
 * demanding it.
 */
export const LAZY_HANDLE: unique symbol = Symbol('fig-tree:lazy-handle')

/** A lazily-evaluated parameter: at most once, memoized, rejections too. */
export interface LazyValue<T = unknown> {
  readonly [LAZY_HANDLE]: true
  evaluate(): Promise<T>
}

/** One element's outcome in a `race` stream — parked, never thrown. */
export interface Settlement {
  index: number
  ok: boolean
  value?: unknown
  error?: unknown
}

/** What a `race` parameter arrives as: settlements in completion order. */
export type SettlementStream = AsyncIterable<Settlement> & {
  readonly [LAZY_HANDLE]: true
  length: number
}

/** A per-element parameter: a fresh scope per index, memoized per index. */
export interface PerElement<T = unknown> {
  readonly [LAZY_HANDLE]: true
  evaluate(index: number): Promise<T>
  /**
   * Every index at once, as settlements in completion order — the same
   * stream a `race` parameter arrives as, which is how the deciding
   * iterators (`find` / `some` / `every`) reuse `and` / `or`'s control
   * flow unchanged. Shares the per-index memo with `evaluate`, so
   * demanding both, or calling `settle()` twice, starts nothing twice;
   * each call is a fresh stream, since a stream is consumed as it is
   * iterated.
   */
  settle(): SettlementStream
}

/** True when a value is an engine handle: `LazyValue`, `PerElement`, stream. */
export const isEngineHandle = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  (value as Record<PropertyKey, unknown>)[LAZY_HANDLE] === true

/**
 * A body-level trace event ("trace" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 * The vocabulary settles in Phase 12; consumers ignore unknown types.
 */
export type TraceEvent = { type: string; [key: string]: unknown }

export interface OperatorContext {
  /** Caller signal, evaluation timeout, enclosing early-resolution scopes */
  signal: AbortSignal
  /** The merged instance + per-call options, frozen for the evaluation */
  options: Readonly<FigTreeOptions>
  cache: {
    /** Memoize a unit of work under a body key; identity when caching is off */
    memo<T>(key: unknown, fn: () => Promise<T>): Promise<T>
  }
  trace: {
    /** Record a body-level event; a no-op when trace is off. */
    note(event: TraceEvent): void
  }
}
