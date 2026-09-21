/**
 * Static-analysis diagnostics ("validate" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Defined here in Phase 1 so the
 * whole surface shares one shape; `validate()` itself and the checks that
 * populate `issues` land in Phase 3.
 */
import type { FigTreeErrorCode } from './errorCodes'

/**
 * `error` blocks evaluation (it would throw / report); `warning` and `hint`
 * never block and surface only through `validate()` or the trace echo.
 */
export type Severity = 'error' | 'warning' | 'hint'

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
}

/** The result of `fig.validate()` (Phase 3). */
export interface ValidationResult {
  /** True when there are no `error`-severity issues. */
  valid: boolean
  /** All findings, in tree order; empty when clean. */
  issues: Issue[]
  /**
   * The fallback rule-3 badge — statically computed, surfaced for the editor.
   */
  timeoutShielded: boolean
}
