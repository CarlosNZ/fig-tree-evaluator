/**
 * `FigTreeOptions` — the settled options shape ("The shape" in the Options
 * area of docs-dev/v3-specs/v3-api.md, minus `excludeOperators`, removed by
 * the July 2026 ruling). Declared whole now (the Phase-1 `FigTreeError`
 * precedent: later phases fill fields without reshaping the type); Phase 2
 * consumes only `operators` and `operatorDefaults` — everything else is
 * stored untouched and picked up by its owning phase.
 */
import type { CacheStore } from './types'
import type { ValidatedOperatorDefinition } from './operatorDefinition'
import type { FragmentDefinition } from './fragments'

/**
 * The options an evaluation runs under, and what `getOptions()` reports:
 * everything but the registry keys. `operators` and `fragments` are consumed
 * at construction and `updateOptions()` and never reach a body — the
 * definitions, and the clients closed inside them, are not evaluation
 * state. Stripped at exactly those two escape points, so the type is true
 * by construction.
 */
export type EvaluationOptions = Omit<FigTreeOptions, 'operators' | 'fragments'>

export interface FigTreeOptions {
  // ── Evaluation environment ──────────────────────────────
  data?: Record<string, unknown>
  /**
   * Registered at construction or via `updateOptions()`, never per call:
   * an artifact bakes in which `$name` keys invoke, so the parse cache is
   * only sound against a stable registry. Definitions validate loudly where
   * they are supplied (src/fragments.ts).
   */
  fragments?: Record<string, FragmentDefinition>

  // ── Operator registry ───────────────────────────────────
  /**
   * Flattened one level; every entry must have passed through
   * `defineOperator()` (ruled July 2026 — a plain definition object is a
   * construction error). Omitted defaults to `coreOperators` only (Phase 4);
   * supplying it states the registry exhaustively.
   */
  operators?: (ValidatedOperatorDefinition | ValidatedOperatorDefinition[])[]
  /**
   * Instance-level parameter defaults plus the `fallback` / `useCache`
   * modifier pseudo-keys. Constants only; required parameters may not be
   * targeted (Q12). Validated at construction.
   */
  operatorDefaults?: { [operator: string]: { [param: string]: unknown } }

  // ── I/O configuration ───────────────────────────────────
  http?: { baseEndpoint?: string; headers?: Record<string, string> }
  graphQL?: { endpoint?: string; headers?: Record<string, string> }

  // ── Reference semantics ─────────────────────────────────
  /** Default false: a missing $data path resolves to null; true: throws. */
  strictDataPaths?: boolean

  // ── Resource limits ─────────────────────────────────────
  maxDepth?: number
  maxNodes?: number
  /**
   * ms, whole evaluation — a strict deadline that includes fallback time.
   * Only static shielding (src/evaluate/run.ts) can shape a timed-out result.
   */
  timeout?: number
  signal?: AbortSignal

  // ── Caching ─────────────────────────────────────────────
  /** Blanket default: node key > operatorDefaults > this > metadata. */
  useCache?: boolean
  /**
   * `maxSize` bounds the built-in store only; a supplied `store` keeps its
   * own eviction policy. `maxTime` is seconds from the write, every store.
   */
  cache?: { store?: CacheStore; maxSize?: number; maxTime?: number }

  // ── Type checking ───────────────────────────────────────
  /** Default true. Structural validation is never skippable. */
  runtimeTypeCheck?: boolean

  // ── Output & error handling ─────────────────────────────
  mode?: 'throw' | 'report'
  trace?: boolean
}
