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

/**
 * Placeholder for the fragment definition shape (the Fragments area of
 * docs-dev/v3-specs/v3-api.md). Narrowed to its real shape in Phase 11;
 * declared now only so the `fragments` option key is stable.
 */
export type FragmentDefinition = unknown

export interface FigTreeOptions {
  // ── Evaluation environment ──────────────────────────────
  data?: Record<string, unknown>
  /** Registered at construction; not per-call. Phase 11. */
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
  /** ms, whole evaluation — the strict deadline (Phase 10). */
  timeout?: number
  signal?: AbortSignal

  // ── Caching ─────────────────────────────────────────────
  /** Blanket default: node key > operatorDefaults > this > metadata. */
  useCache?: boolean
  cache?: { store?: CacheStore; maxSize?: number; maxTime?: number }

  // ── Type checking ───────────────────────────────────────
  /** Default true. Structural validation is never skippable. */
  runtimeTypeCheck?: boolean

  // ── Output & error handling ─────────────────────────────
  mode?: 'throw' | 'report'
  trace?: boolean
}
