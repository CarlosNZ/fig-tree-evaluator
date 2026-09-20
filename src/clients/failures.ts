/**
 * The one place an HTTP failure payload is assembled ("The client
 * contracts" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * Note what this function cannot do: it takes no headers argument, and has
 * no way to reach one. The batch-8 rule — header values never echo, since
 * headers are the secret-bearing channel — therefore holds by
 * construction rather than by every call site remembering it. Trace
 * renders header names; nothing renders values.
 */
import { OperatorFailure } from '../OperatorFailure'

export interface HttpFailureInfo {
  status: number
  statusText: string
  url: string
  /** The response body, parsed where it was JSON, raw text where it was not. */
  payload: unknown
}

export const httpFailure = (info: HttpFailureInfo): OperatorFailure =>
  new OperatorFailure(`request failed (${info.status}): ${info.url}`, {
    errorData: {
      status: info.status,
      statusText: info.statusText,
      url: info.url,
      response: info.payload,
    },
  })

/**
 * A driver error, named by driver so the message says which database
 * refused. `errorData` carries the driver's own classifiers where it
 * publishes them — deliberately NOT postgres' `detail` / `hint`, which
 * quote offending row values into the payload and would put user data
 * into an error a host may well log.
 */
export const sqlFailure = (driver: string, error: unknown): OperatorFailure => {
  const message = error instanceof Error ? error.message : String(error)
  const fields = (error ?? {}) as Record<string, unknown>
  const errorData: Record<string, unknown> = { driver }
  for (const field of ['code', 'table', 'column', 'constraint'] as const) {
    if (typeof fields[field] === 'string') errorData[field] = fields[field]
  }
  return new OperatorFailure(`${driver}: ${message}`, { errorData })
}

/**
 * A long non-JSON body is a diagnostic, not a payload: enough to see what
 * came back instead of JSON, not enough to paste a whole error page into
 * an error object.
 */
export const truncate = (text: string, limit = 500): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}… (${text.length} characters)`
