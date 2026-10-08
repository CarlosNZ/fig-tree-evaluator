/**
 * The failures an I/O client throws, and the one check the I/O operators
 * hold them to ("Client failures: codes and the enforced shape" in
 * docs-dev/v3-specs/v3-operator-contract.md).
 *
 * A fallback branches on a failure's `code` and `errorData` through
 * `$error`, so each code promises its fields. The builders here are how
 * the bundled clients, and a host's own, produce them; `fromClient` is how
 * the operators turn any other shape into `request-failure`.
 */
import { ErrorCodes, type KnownFallbackErrorCode } from '../errorCodes'
import { OperatorFailure, isOperatorFailure } from '../OperatorFailure'
import { checkType, type ExpectedType } from '../typeCheck'

export interface HttpFailureInfo {
  status: number
  statusText: string
  url: string
  /** The response body, parsed where it was JSON, raw text where it was not. */
  response: unknown
}

/**
 * A non-2xx response.
 *
 * Note what this function cannot do: it takes no headers argument, and
 * copies only the four fields it names. The batch-8 rule — header values
 * never echo, since headers are the secret-bearing channel — therefore
 * holds by construction rather than by every call site remembering it.
 * Trace renders header names; nothing renders values.
 */
export const httpFailure = (info: HttpFailureInfo): OperatorFailure =>
  new OperatorFailure(`request failed (${info.status}): ${info.url}`, {
    code: ErrorCodes.httpStatus,
    errorData: {
      status: info.status,
      statusText: info.statusText,
      url: info.url,
      response: info.response,
    },
  })

/** A response that is not what the protocol promises. */
export const invalidResponse = (message: string, url: string, response: unknown): OperatorFailure =>
  new OperatorFailure(message, { code: ErrorCodes.invalidResponse, errorData: { url, response } })

/**
 * A driver error, named by driver so the message says which database
 * refused, and so `driverCode` says whose vocabulary it is in. `errorData`
 * carries the driver's own classifiers where it publishes them —
 * deliberately NOT postgres' `detail` / `hint`, which quote offending row
 * values into the payload and would put user data into an error a host
 * may well log.
 */
export const sqlFailure = (driver: string, error: unknown): OperatorFailure => {
  const message = error instanceof Error ? error.message : String(error)
  const fields = (error ?? {}) as Record<string, unknown>
  const errorData: Record<string, unknown> = { driver }
  if (typeof fields.code === 'string') errorData.driverCode = fields.code
  for (const field of ['table', 'column', 'constraint'] as const) {
    if (typeof fields[field] === 'string') errorData[field] = fields[field]
  }
  return new OperatorFailure(`${driver}: ${message}`, { code: ErrorCodes.sqlError, errorData })
}

type ClientKind = 'http' | 'sql'

type Shape = Record<string, ExpectedType>

const OPTIONAL_STRING = ['string', 'null'] as const

/**
 * What a client may throw, by kind: each code, and the `errorData` fields
 * it promises, in the parameters' type vocabulary. An absent field is read
 * as `null`, as `$error` reads it, so a field whose type names `null` is
 * optional and every other is required. Fields not listed are the client's
 * own, kept and not checked.
 *
 * Keyed by the codes' strings: with its keys read from `ErrorCodes`, an
 * engine-only consumer keeps this table, though nothing there uses it
 * (#193).
 */
const CLIENT_FAILURES: Record<ClientKind, Partial<Record<KnownFallbackErrorCode, Shape>>> = {
  http: {
    'http-status': { status: 'number', statusText: 'string', url: 'string', response: 'any' },
    'invalid-response': { url: 'string', response: 'any' },
  },
  sql: {
    'sql-error': { driver: 'string', driverCode: OPTIONAL_STRING },
  },
}

/**
 * A client's failure as its operator raises it: as thrown, when its code is
 * one this kind of client may throw and the promised fields fit; otherwise
 * `request-failure`, keeping only the client's message. The raw error is
 * never kept, since a raw client error can carry the request's headers.
 */
export const clientFailure = (error: unknown, kind: ClientKind): OperatorFailure => {
  const shapes = CLIENT_FAILURES[kind]
  if (isOperatorFailure(error) && error.code !== undefined && Object.hasOwn(shapes, error.code)) {
    const data = error.errorData ?? {}
    const shape = shapes[error.code as KnownFallbackErrorCode] as Shape
    if (Object.entries(shape).every(([field, type]) => checkType(data[field] ?? null, type).ok))
      return error
  }
  return new OperatorFailure(error instanceof Error ? error.message : String(error), {
    code: ErrorCodes.requestFailure,
  })
}

/**
 * The client call, and only the call: an operator's own failures, raised
 * before or after it, keep their codes.
 */
export const fromClient = async <T>(call: () => Promise<T>, kind: ClientKind): Promise<T> => {
  try {
    return await call()
  } catch (error) {
    throw clientFailure(error, kind)
  }
}

/**
 * A long non-JSON body is a diagnostic, not a payload: enough to see what
 * came back instead of JSON, not enough to paste a whole error page into
 * an error object.
 */
export const truncate = (text: string, limit = 500): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}… (${text.length} characters)`
