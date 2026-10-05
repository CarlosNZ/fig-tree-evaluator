/**
 * Static-analysis diagnostics ("validate" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Defined here in Phase 1 so the
 * whole surface shares one shape; `validate()` itself and the checks that
 * populate `issues` land in Phase 3.
 */
import type { FigTreeErrorCode } from './errorCodes'

/**
 * `error` blocks evaluation (it would throw); `warning` never
 * blocks and surfaces only through `validate()` or the trace echo.
 */
export type Severity = 'error' | 'warning'

/**
 * A single finding. `code` draws on the same vocabulary as `FigTreeError.code`
 * (src/errorCodes.ts), so a static check and its runtime counterpart classify
 * the same way.
 */
export interface Issue {
  severity: Severity
  code: FigTreeErrorCode
  message: string
  path: (string | number)[]
  operator?: string
  /**
   * The fragment whose signature the issue is against — the owner of
   * `parameter` where the node is a call, as `operator` is where it is an
   * operator node. Caller-side, unlike `FigTreeError.fragment`, which marks
   * a failure INSIDE a body: bodies compile at registration, so a static
   * issue can only ever be about the call, and `path` is in the input.
   */
  fragment?: string
  parameter?: string
  /**
   * A drop-in replacement for the name the issue is about, where one is
   * close enough to suggest: the key, operator or fragment name as it
   * would be written, so a shorthand key's suggestion keeps its `$`. The
   * same suggestion as the message's "did you mean", for a tool to offer
   * as a fix.
   */
  suggestion?: string
}

/** The result of `fig.validate()` (Phase 3). */
export interface ValidationResult {
  /** True when there are no `error`-severity issues. */
  valid: boolean
  /** All findings, in tree order; empty when clean. */
  issues: Issue[]
}
