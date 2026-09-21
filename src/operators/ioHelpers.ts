/**
 * The assembly the three I/O operators share ("The I/O contract" in Batch
 * 8 of docs-dev/v3-specs/v3-operator-parameters-2.md).
 *
 * The operator owns URL building, header merging and the memo key; the
 * client only transports. That split is what keeps `FetchClient`,
 * `AxiosClient` and a host's own wrapper thin and equivalent — and it is
 * why v2's query-string assembly, which lived in two clients and differed
 * between them, does not come across.
 *
 * One generating rule decides what goes in the memo key, so the three
 * operators agree: **the memo unit is everything that can fail because of
 * the network or the driver; pure reshaping of a successful payload sits
 * outside it.** So `returnPath`, `shape` and `noRowDefault` are outside,
 * and graphQL's `errors` check is inside.
 */
import { OperatorFailure } from '../OperatorFailure'
import { ErrorCodes } from '../errorCodes'
import { renderText, resolvePath } from '../primitives'
import { describeType } from '../typeCheck'
import { isPlainObject } from '../utils'
import { toSegments } from './shared'

export interface EffectiveRequest {
  method: 'get' | 'post'
  url: string
  headers: Record<string, string>
  body?: unknown
}

const FULL_URL = /^https?:\/\//i

/**
 * v2's rule, kept: a full `http(s)` URL is used verbatim, anything else —
 * `''` included — joins `http.baseEndpoint`. `url: ''` is how an author
 * spells "the base itself", deliberately, which is why `url` rejects null:
 * absence must never be able to manufacture an address.
 *
 * The result is validated but never normalized. The string that goes on
 * the wire is the string that goes in the cache key, so a spelling the
 * server treats as significant survives both.
 */
export const assembleUrl = (
  url: string,
  query: Record<string, unknown> | undefined,
  base: string | undefined
): string => {
  const resolved = FULL_URL.test(url) ? url : joinBase(base, url)
  const pairs = renderQuery(query)
  const full = pairs === '' ? resolved : `${resolved}${resolved.includes('?') ? '&' : '?'}${pairs}`
  try {
    void new URL(full)
  } catch {
    throw new OperatorFailure(`'${full}' is not a valid URL`, { code: ErrorCodes.typeCheck })
  }
  return full
}

/**
 * Only the seam is touched: one trailing slash off the base, one leading
 * slash off the path, so `base/` + `/users` and `base` + `users` are one
 * address. Everything else, a trailing slash on the path included, goes
 * on the wire as authored.
 */
const joinBase = (base: string | undefined, url: string): string => {
  if (base === undefined || base === '')
    throw new OperatorFailure(`'${url}' is a relative URL and no http.baseEndpoint is configured`, {
      code: ErrorCodes.typeCheck,
    })
  if (url === '') return base
  return `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
}

/**
 * Query pairs render through the shared stringification table; a **null
 * value omits its pair** (register row 28), and a composite value is a
 * runtime type error — repeated-key, comma-joined and bracket conventions
 * all exist and none is canonical, so the author renders it explicitly.
 *
 * Because nulls are gone before `URLSearchParams` sees anything, v2's
 * `String(null)` → `?x=null` coercion cannot recur.
 */
export const renderQuery = (query: Record<string, unknown> | undefined): string => {
  if (query === undefined) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    params.append(key, wireScalar(value, `query['${key}']`, 'query'))
  }
  return params.toString()
}

/**
 * The header chain: the `http.headers` option, then `graphQL.headers`,
 * then the node's own — per key, later wins. A **null value removes the
 * pair**, which is the per-node tool for unsetting an instance default (a
 * public endpoint inside an authed environment).
 *
 * Exact-key: HTTP treats names case-insensitively and FigTree does not
 * normalize, so an environment picks one spelling and keeps to it.
 */
export const mergeHeaders = (
  ...sources: (Record<string, unknown> | undefined)[]
): Record<string, string> => {
  const merged: Record<string, string> = {}
  for (const source of sources) {
    if (source === undefined) continue
    for (const [key, value] of Object.entries(source)) {
      if (value === null || value === undefined) {
        delete merged[key]
        continue
      }
      merged[key] = wireScalar(value, `headers['${key}']`, 'header')
    }
  }
  return merged
}

/**
 * JSON is the operator's content type, supplied at the BOTTOM of the
 * chain: so it appears in the memo key, an option or a node can override
 * it, and `headers: { 'Content-Type': null }` removes it. A GET advertises
 * no content type, having no content.
 */
export const jsonHeaders = (hasBody: boolean): Record<string, string> => ({
  Accept: 'application/json',
  ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
})

const wireScalar = (value: unknown, at: string, kind: string): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return renderText(value)
  throw new OperatorFailure(
    `${at} is ${describeType(value)} — a ${kind} value must be a string, number or boolean; ` +
      'render it explicitly (join) or supply a fully-formed URL',
    { code: ErrorCodes.typeCheck }
  )
}

/**
 * The memo key: the effective request, and nothing else. `returnPath`
 * never appears — drilling applies post-cache to the shared entry, which
 * is what kills v2's duplicate fetch per drill path. Nor does `timeout`:
 * two nodes differing only in how long they will wait are the same
 * request.
 *
 * Headers are **sorted** here and only here. The wire gets merge order;
 * the key gets a canonical one, because a header map is a set rather than
 * a sequence and "two nodes spelling one request share one entry" is false
 * otherwise. The URL's query string is deliberately NOT reordered: the
 * server sees it verbatim, so a different spelling is a different request.
 */
export const requestKey = (request: EffectiveRequest): unknown => ({
  method: request.method,
  url: request.url,
  headers: Object.fromEntries(
    Object.entries(request.headers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  ),
  ...(request.body !== undefined ? { body: request.body } : {}),
})

/**
 * An empty container and an absent one are the same request, so they must
 * not fork the key: `{ $sql: ['SELECT 1'] }` binds `values: []` through the
 * rest slice while the named face leaves it absent.
 */
export const isNonEmpty = (container: unknown): boolean => {
  if (Array.isArray(container)) return container.length > 0
  if (isPlainObject(container)) return Object.keys(container).length > 0
  return container !== undefined && container !== null
}

/**
 * Response drilling: `get.path`'s grammar, and `get`'s absence rule minus
 * the strictness layer. `strictDataPaths` deliberately does not reach
 * here — a response is operator output, not a reference namespace, and the
 * escapes are `firstOf` or a wrapping `get.missingPathDefault`.
 */
export const drill = (value: unknown, returnPath: string | unknown[] | undefined): unknown => {
  if (returnPath === undefined) return value
  const found = resolvePath(value, toSegments(returnPath))
  if (!found.found) return null
  return found.value === undefined ? null : found.value
}

/**
 * Apollo's default `errorPolicy: 'none'`, adopted (register row 30): a
 * non-empty `errors` array fails the node, partial `data` included, with
 * the errors in `errorData`. v2 read `response.data` and silently dropped
 * the field.
 */
export const graphQLData = (response: unknown): unknown => {
  if (!isPlainObject(response)) throw new OperatorFailure('the GraphQL response was not an object')
  const errors = (response as Record<string, unknown>).errors
  if (Array.isArray(errors) && errors.length > 0) {
    const first = (errors[0] as { message?: unknown } | null)?.message
    throw new OperatorFailure(
      `the GraphQL response carried ${errors.length} error${errors.length === 1 ? '' : 's'}` +
        (typeof first === 'string' ? `: ${first}` : ''),
      { errorData: { errors } }
    )
  }
  if (!('data' in (response as Record<string, unknown>)))
    throw new OperatorFailure('the GraphQL response carried neither data nor errors')
  return (response as Record<string, unknown>).data ?? null
}

export type SqlShape = 'rows' | 'firstRow' | 'column' | 'firstValue'

/**
 * The declarative reshape that replaced v2's `single` / `flatten`
 * booleans and their runtime magic (`vals.length <= 1 ? vals[0] : vals`,
 * whose result shape depended on how many columns happened to arrive).
 *
 * Multi-ROW under the singular shapes takes the first, no error —
 * queryOne semantics, where determinism is the query's job. Multi-COLUMN
 * under the single-column shapes is an error, because silently dropping a
 * column is the plausible-wrong failure the gradient rates worst.
 */
export const reshape = async (
  rows: Record<string, unknown>[],
  shape: SqlShape,
  noRowDefault: { evaluate: () => Promise<unknown> }
): Promise<unknown> => {
  switch (shape) {
    case 'rows':
      return rows
    case 'firstRow':
      return rows.length === 0 ? noRowDefault.evaluate() : rows[0]
    case 'column':
      return rows.map((row) => onlyColumn(row, 'column'))
    case 'firstValue':
      return rows.length === 0 ? noRowDefault.evaluate() : onlyColumn(rows[0], 'firstValue')
  }
}

const onlyColumn = (row: unknown, shape: string): unknown => {
  if (!isPlainObject(row)) throw new OperatorFailure('a row was not an object')
  const values = Object.values(row)
  if (values.length !== 1)
    throw new OperatorFailure(
      `shape: '${shape}' needs a single-column result — this row has ${values.length} ` +
        'columns; name the one column you want in the SQL',
      { code: ErrorCodes.typeCheck }
    )
  return values[0]
}
