/**
 * `FigTreeOptions` — the settled options shape ("The shape" in the Options
 * area of docs-dev/v3-specs/v3-api.md, minus `excludeOperators`, removed by
 * the July 2026 ruling). Declared whole now (the Phase-1 `FigTreeError`
 * precedent: later phases fill fields without reshaping the type); Phase 2
 * consumes only `operators` and `operatorDefaults` — everything else is
 * stored untouched and picked up by its owning phase.
 */
import type { CacheStore } from './types'
import type { TraceNode } from './FigTreeError'
import type { OperatorEntry } from './operatorDefinition'
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

/**
 * The request-scoped options, and so the only ones a call may supply
 * ("Per-call options" in the Options area of docs-dev/v3-specs/v3-api.md;
 * ruled September 2026). Everything else in `FigTreeOptions` is instance
 * configuration, set at construction or via `updateOptions()`. A call
 * naming any other key is refused (`invalid-options`).
 *
 * A per-call value REPLACES the instance value for that evaluation —
 * `data` included, which is used by reference: the object the caller
 * passed is the object every body and `$data` reference reads, uncopied
 * and unfrozen. Keys set to `undefined` are ignored.
 */
export type CallOptions = Pick<FigTreeOptions, 'data' | 'signal' | 'timeout' | 'trace'>

/**
 * What `validate()` takes: the per-call options, plus `params`, the
 * declared parameter names of a fragment body being validated, which its
 * `$params` references resolve against as they do at registration.
 * `validate()`'s alone — `evaluate()` and `compile()` refuse `params` as
 * they refuse any key outside `CallOptions`.
 */
export type ValidateOptions = CallOptions & { params?: readonly string[] }

export interface FigTreeOptions {
  // ── Evaluation environment ──────────────────────────────
  /**
   * Held by reference and never copied or frozen: the block an evaluation
   * reads is the object the host supplied, per call or to the instance.
   * The engine never writes to it (pinned by test, not by code).
   */
  data?: Record<string, unknown>
  /**
   * Registered at construction or via `updateOptions()`, never per call:
   * an artifact bakes in which `$name` keys invoke, so the compile cache is
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
  operators?: readonly OperatorEntry[]
  /**
   * Instance-level parameter defaults plus the `fallback` / `noCache`
   * modifier pseudo-keys. Constants only; required parameters may not be
   * targeted (Q12). `noCache` turns off the caching of an operator whose
   * definition declares `cache: true`, and nothing turns it back on.
   * Validated at construction, since options can come from untyped config.
   */
  operatorDefaults?: {
    [operator: string]: { noCache?: true; fallback?: unknown; [param: string]: unknown }
  }

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
   * No default: unset, an evaluation waits as long as its I/O clients do,
   * and a client left on its own defaults may wait forever (Axios and
   * node-postgres set no request timeout). A host that runs network-bound
   * expressions bounds them here, on the client it passes in, or both.
   */
  timeout?: number
  signal?: AbortSignal

  // ── Caching ─────────────────────────────────────────────
  /**
   * `maxSize` bounds the built-in store only; a supplied `store` keeps its
   * own eviction policy. `maxTime` is seconds from the write, every store.
   */
  cache?: { store?: CacheStore; maxSize?: number; maxTime?: number }

  // ── Diagnostics ─────────────────────────────────────────
  /**
   * Record what happened at every node instance. `trace` changes no
   * semantics: a failing run still throws, and its error carries the
   * partial tree as `error.trace`.
   *
   * Opt-in, and priced accordingly: the tree holds one entry per node
   * INSTANCE (one per iterator element) and holds values by reference, so
   * a retained trace retains whole API responses.
   */
  trace?: boolean
}

/**
 * What `updateOptions()` accepts: `FigTreeOptions` with `null` admitted at
 * the two levels the merge reaches, where it removes the stored value
 * ("Merge semantics" in the Options area of docs-dev/v3-specs/v3-api.md).
 * `undefined` still means "not supplied", so an unset variable never
 * removes anything. `data` and `operators` replace whole, so only their
 * own key takes `null`.
 */
export type OptionsUpdate = {
  [Key in keyof FigTreeOptions]?:
    | (Key extends MergedBlock ? Removable<NonNullable<FigTreeOptions[Key]>> : FigTreeOptions[Key])
    | null
}

/** The options the merge goes inside: every plain-data block but `data`. */
type MergedBlock = 'fragments' | 'operatorDefaults' | 'http' | 'graphQL' | 'cache'

type Removable<Block> = { [Key in keyof Block]?: Block[Key] | null }

/**
 * What `evaluate()` returns under `trace` ("The envelope rule" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 */
export interface EvaluationResult {
  /** The evaluated value. */
  result: unknown
  /** The instance tree. */
  trace: TraceNode
}

/**
 * The bare value, unless `trace` is `true`.
 *
 * The class and `evaluate()` infer `trace` alone as their type parameter,
 * never the options object whole. An object in a type-parameter position
 * escapes excess-property checking — inference accepts any literal that
 * shares one key with the constraint — so a misspelt option beside a
 * valid one would pass unremarked (#266). With only `trace` inferred, the
 * rest of each parameter is plain `FigTreeOptions` or `CallOptions`,
 * checked in full, nested blocks included.
 *
 * No `const` type parameter is needed to keep `true` from widening to
 * `boolean` (settled by a spike at Phase-12 planning): widening applies to
 * a mutable variable declaration, not to inference into a type-parameter
 * position, so a fresh object literal argument infers the literal on its
 * own. The one case that does widen is a caller hoisting the options into
 * a variable first, which `const` could not have reached either. The other
 * is an instance whose `trace` was changed by `updateOptions()`, which the
 * type parameter cannot follow (see that method's docstring).
 */
export type ResultShape<Trace extends boolean> = Trace extends true ? EvaluationResult : unknown
