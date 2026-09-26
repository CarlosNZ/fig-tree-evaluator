/**
 * The requests each engine sent in a case, as the comparison reads them
 * ("Output" in docs-dev/v3-specs/v3-converter.md). Where both engines sent
 * the same ones and the outcomes still differ, the conversion asked for the
 * right thing, and the difference is in how a response was read.
 */
import type { SentRequest } from './mocks/sent'

/** The headers both engines' clients set themselves, on every request */
const CLIENT_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'content-type': 'application/json',
}

/**
 * A request as one line: an HTTP request's method, URL, body and headers,
 * or a query's text and values. What the engines' own clients decide,
 * rather than any conversion, is left out: the headers above (which v2's
 * client sends even on a request with no body), the empty `variables` v2
 * puts in every GraphQL body, and how a URL is spelled, since the two
 * clients join an endpoint differently: each URL is read in its standard
 * form, so `https://a.b` and `https://a.b/` are one. A body's keys are
 * sorted, since v3 reorders keys.
 */
export const describeRequest = (request: SentRequest): string => {
  if (request.kind === 'sql') return `SQL ${request.text} ${JSON.stringify(request.values ?? [])}`
  const headers = Object.fromEntries(
    Object.entries(request.headers)
      // A header set to `undefined` is not sent
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => [name.toLowerCase(), String(value)] as const)
      .filter(([name, value]) => CLIENT_HEADERS[name] !== value.toLowerCase())
      .sort(([a], [b]) => (a < b ? -1 : 1))
  )
  return [
    request.method,
    standardUrl(request.url),
    ...(request.body !== undefined ? [describeBody(request.body)] : []),
    ...(Object.keys(headers).length > 0 ? [`headers ${JSON.stringify(headers)}`] : []),
  ].join(' ')
}

const standardUrl = (url: string) => {
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

const describeBody = (body: unknown): string => {
  let parsed: unknown
  try {
    parsed = typeof body === 'string' ? JSON.parse(body) : body
  } catch {
    return String(body)
  }
  if (isObject(parsed) && typeof parsed.query === 'string' && isEmpty(parsed.variables)) {
    parsed = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'variables'))
  }
  return JSON.stringify(sorted(parsed))
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isEmpty = (value: unknown) => isObject(value) && Object.keys(value).length === 0

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sorted(value[key])])
  )
}

/**
 * Whether two engines sent the same requests, in any order, since each
 * evaluates a node's parameters together
 */
export const sameRequests = (a: string[], b: string[]): boolean => {
  const [left, right] = [[...a].sort(), [...b].sort()]
  return left.length === right.length && left.every((request, i) => request === right[i])
}
