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
 * `CallOpts` with every key outside `CallOptions` typed `never`, so a
 * call mixing a legitimate key with a configuration one
 * (`{ data, maxDepth: 5 }`) is a type error and not only a runtime
 * refusal. Excess-property checking alone does not reach a type-parameter
 * position: inference accepts any object literal that overlaps the
 * constraint by one key.
 */
export type OnlyCallOptions<CallOpts> = CallOpts & {
  [Key in Exclude<keyof CallOpts, keyof CallOptions>]: never
}

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
  operators?: (ValidatedOperatorDefinition | ValidatedOperatorDefinition[])[]
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
 * "No options supplied" — the identity of the merge below, and the
 * default for both type parameters. Spelled this way rather than `{}`,
 * which means "any non-nullish value" and is a lint error for saying so.
 */
export type NoOptions = Record<never, never>

/** Per-call options over instance ones, at the merge rule's top level. */
export type Merge<Instance, Call> = Omit<Instance, keyof Call> & Call

/**
 * The bare value, unless `trace` is on.
 *
 * No `const` type parameter is needed to keep `{ trace: true }` from
 * widening to `boolean` (settled by a spike at Phase-12 planning):
 * widening applies to a mutable variable declaration, not to inference
 * into a type-parameter position, so a fresh object literal argument
 * infers the literal on its own — where `const` would additionally turn
 * the `operators` array literal into a readonly tuple the declared type
 * does not accept. The one case that does widen is a caller hoisting the
 * options into a variable first, which `const` could not have reached
 * either. The other is an instance whose `trace` was changed by
 * `updateOptions()`, which the type parameter cannot follow (see that
 * method's docstring).
 */
export type ResultShape<O> = O extends { trace: true } ? EvaluationResult : unknown
