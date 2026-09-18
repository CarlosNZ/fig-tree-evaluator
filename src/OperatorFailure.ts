/**
 * The error class an operator body throws to raise a structured runtime
 * failure ("The runtime interface" in
 * docs-dev/v3-specs/v3-operator-contract.md; contract Q6, resolved
 * September 2026). The engine wraps it into a `FigTreeError` tagged with the
 * node path and operator name, carrying `code` (default `operator-failure`)
 * and `errorData` through. A plain `Error` remains legal for the simple
 * cases and becomes code `operator-failure`.
 */
export interface OperatorFailureInit {
  /** A stable classifier from the shared vocabulary (src/errorCodes.ts). */
  code?: string
  /** Structured payload — I/O status, url, response; header names only. */
  errorData?: Record<string, unknown>
}

export class OperatorFailure extends Error {
  code?: string
  errorData?: Record<string, unknown>

  constructor(message: string, init: OperatorFailureInit = {}) {
    super(message)
    this.name = 'OperatorFailure'
    if (init.code !== undefined) this.code = init.code
    if (init.errorData !== undefined) this.errorData = init.errorData
  }
}

export const isOperatorFailure = (input: unknown): input is OperatorFailure =>
  input instanceof OperatorFailure
