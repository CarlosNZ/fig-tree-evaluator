/**
 * The `trace` vocabulary ("trace: true — the process" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Trace mirrors the INSTANCE tree, not the static one: the compiled AST
 * unrolled by iteration (one entry per element), by fragment calls (one
 * body instance per call site) and by var evaluations. Each entry points
 * back at its static location, which is how an editor overlays many
 * instances onto the one tree it renders — grouping by `(source, path)`.
 *
 * The engine fills these; nothing here is authored. The shapes are public
 * because the editor and any host debugging tool consume them.
 */
import type { FigTreeError } from './FigTreeError'
import type { Issue } from './issues'
import type { TraceEvent } from './runtimeInterface'

/**
 * What became of one node instance.
 *
 * `skipped` is the one that is not about failure: it marks a subtree that
 * was statically present and never demanded — the untaken `if` branch, an
 * undemanded `firstOf` candidate, a var nothing referenced, a `fallback`
 * that never fired. Laziness made visible, which is half of what trace is
 * for. `cancelled` is its opposite: work that started and was then
 * abandoned, by a sibling resolving early or by the kill switch.
 */
export type TraceStatus = 'value' | 'failed' | 'fallback' | 'cancelled' | 'skipped'

/**
 * Which kind of thing the entry is.
 *
 * `skeleton` is an addition to the drafted vocabulary (Phase 12): a plain
 * container with evaluable descendants is neither an operator nor an
 * inert literal, and an editor painting the tree needs to tell a constant
 * apart from a shape whose holes are being filled.
 */
export type TraceKind = 'operator' | 'fragment' | 'reference' | 'literal' | 'skeleton'

export interface TraceNode {
  /** The static location, within its own source. */
  path: (string | number)[]
  /** The fragment body this entry belongs to; absent = the input. */
  source?: { fragment: string }
  kind: TraceKind
  /** Canonical name — never the alias the author happened to spell. */
  operator?: string
  /** Reference occurrences: the reference string as authored. */
  ref?: string
  /**
   * Set where this entry is a var's definition evaluating. A var is ONE
   * entry, not two: its definition and its declaration share a path, so a
   * second wrapper would break the one-instance-per-location property the
   * `(source, path)` join depends on.
   */
  var?: string
  status: TraceStatus
  /** The value returned, for `value` and `fallback`. */
  value?: unknown
  /** For `failed`; for `fallback`, the error the fallback caught. */
  error?: FigTreeError
  /** Body notes via `context.trace.note`, plus engine cache events. */
  events?: TraceEvent[]
  /**
   * Instance children, in structural order — declaration and element
   * order, never completion order, so a trace is stable enough to diff
   * and to assert on. Timing lives in `elapsed`.
   */
  children?: TraceNode[]
  /** Wall-clock milliseconds. */
  elapsed?: number
  /**
   * Root entry only: the parse pass's warnings and hints, echoed so a
   * trace consumer sees the unrecognized-`$` class without a second call.
   */
  warnings?: Issue[]
}

/** A cache lookup the engine made on this node's behalf. */
export interface CacheTraceEvent {
  type: 'cache'
  hit: boolean
}

/** An HTTP or GraphQL request, as actually sent. Header NAMES only. */
export interface RequestTraceEvent {
  type: 'request'
  method: string
  url: string
  headers: string[]
}

/** A SQL statement, as actually sent — text only, never bound values. */
export interface QueryTraceEvent {
  type: 'query'
  text: string
}

/** One token's render, where the render is worth remarking on. */
export interface RenderTraceEvent {
  type: 'render'
  token: string
  rendered: 'literal' | 'placeholder' | 'empty' | 'gap-closed'
}

/** A runtime duplicate key in `buildObject`: the later entry won. */
export interface KeyOverwriteTraceEvent {
  type: 'key-overwrite'
  key: string
}

/** This hole contributed its static fallback on a shielded timeout. */
export interface ShieldedFallbackTraceEvent {
  type: 'shielded-fallback'
}

/**
 * The events the engine and the core operators emit. Not a closed set —
 * `TraceEvent` stays open so a custom operator can emit its own, and a
 * consumer must ignore a type it does not know.
 */
export type KnownTraceEvent =
  | CacheTraceEvent
  | RequestTraceEvent
  | QueryTraceEvent
  | RenderTraceEvent
  | KeyOverwriteTraceEvent
  | ShieldedFallbackTraceEvent
