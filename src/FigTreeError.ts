/**
 * The single error class for FigTree ("FigTreeError — the shape the area owns"
 * in docs-dev/v3-specs/v3-evaluator-methods.md). Both thrown errors and the
 * `errors` entries of a `mode: 'report'` run are instances of this one class.
 *
 * v3 rebuilds v2's [FigTreeError.ts] rather than porting it: a structured
 * options constructor replaces v2's loose `Object.assign(this, error)`, and
 * `prettyPrint` is a method (computed on demand) rather than a string eagerly
 * built in the constructor.
 *
 * NOTE (Phase 1.2): most fields are populated only by later phases — the
 * engine's report-mode machinery sets `holePath` (Phase 12); `race` sets
 * `related` (Phase 5); `fallback` sets `cause` (Phase 4); static-error throws
 * carry `issues` (Phase 3); fragment-body failures carry
 * `fragment`/`fragmentPath` (Phase 11); `trace` is attached when trace is on
 * and evaluation threw (Phase 12). The class only declares them here so those
 * phases fill them without reshaping the type. The body-side `OperatorFailure`
 * throwing class (contract Q6) is deferred until Phase 4/9 needs it;
 * `errorData` is first-class now so it can just construct one.
 */
import type { FigTreeErrorCode } from './errorCodes'
import type { Issue } from './issues'

/**
 * Placeholder for the trace instance-tree node ("trace" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Narrowed to its real shape in
 * Phase 12; declared now only so the `trace` field name is stable.
 */
export type TraceNode = unknown

export interface FigTreeErrorInit {
  code: FigTreeErrorCode
  message: string
  /**
   * The failing node, in the input as authored (the origin, not the containing
   * hole).
   */
  path: (string | number)[]
  /**
   * Report mode: the containing hole that degraded to null — the splice point.
   */
  holePath?: (string | number)[]
  operator?: string
  /**
   * Set when the failure is inside a fragment body; `path` then points at the
   * call node.
   */
  fragment?: string
  fragmentPath?: (string | number)[]
  /** Structured payload (e.g. I/O status/url/response — header names only). */
  errorData?: Record<string, unknown>
  /** Sibling parked failures (and/or). */
  related?: FigTreeError[]
  /** Fallback rule 4: the original failure when a fallback itself failed. */
  cause?: unknown
  /** Static-error throws only: the full validate stream. */
  issues?: Issue[]
  /**
   * When trace was on and evaluation threw: the partial instance tree up to
   * the failure.
   */
  trace?: TraceNode
}

export class FigTreeError extends Error {
  code: FigTreeErrorCode
  path: (string | number)[]
  holePath?: (string | number)[]
  operator?: string
  fragment?: string
  fragmentPath?: (string | number)[]
  errorData?: Record<string, unknown>
  related?: FigTreeError[]
  cause?: unknown
  issues?: Issue[]
  trace?: TraceNode

  constructor(init: FigTreeErrorInit) {
    super(init.message)
    this.name = 'FigTreeError'
    this.code = init.code
    this.path = init.path
    if (init.holePath !== undefined) this.holePath = init.holePath
    if (init.operator !== undefined) this.operator = init.operator
    if (init.fragment !== undefined) this.fragment = init.fragment
    if (init.fragmentPath !== undefined) this.fragmentPath = init.fragmentPath
    if (init.errorData !== undefined) this.errorData = init.errorData
    if (init.related !== undefined) this.related = init.related
    if (init.cause !== undefined) this.cause = init.cause
    if (init.issues !== undefined) this.issues = init.issues
    if (init.trace !== undefined) this.trace = init.trace
  }

  /**
   * Human-facing rendering (kept from v2, now a method): a header of the code,
   * the operator where known, and the authored path; then the message; then
   * pretty-printed `errorData` (suppressed when empty).
   */
  prettyPrint(): string {
    const operatorText = this.operator ? ` (operator: ${this.operator})` : ''
    const pathText = this.path.length > 0 ? ` at ${formatPath(this.path)}` : ''
    const header = `${this.code}${operatorText}${pathText}`
    const hasData = this.errorData && Object.keys(this.errorData).length > 0
    const dataText = hasData ? `\n${JSON.stringify(this.errorData, null, 2)}` : ''
    return `${header}\n${this.message}${dataText}`
  }
}

export const isFigTreeError = (input: unknown): input is FigTreeError =>
  input instanceof FigTreeError

/** Render an authored path as `a[0].b` for messages. */
const formatPath = (path: (string | number)[]): string =>
  path.map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? seg : `.${seg}`)).join('')
