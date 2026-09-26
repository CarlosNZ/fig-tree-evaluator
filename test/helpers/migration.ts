/**
 * Shared by the converter's suites (Phase 15.1): inputs held still, and the
 * published v2 package (the devDependency `fig-tree-evaluator-v2`) as the
 * oracle beside v3.
 */
import { FigTreeEvaluator, type EvaluatorNode, type FigTreeOptions } from 'fig-tree-evaluator-v2'
import type { FigTree } from '../../src'

/** What an engine made of an expression: its value, or that it failed */
export type Outcome = { value: unknown } | { error: true }

/**
 * A deep copy made in this realm. `structuredClone` makes Node's objects,
 * which fail v2's `instanceof Object` test for a node inside Jest's context.
 */
export const clone = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(clone)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, clone(v)]))
}

export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

/** A v2 value as v3 would give it: v3 has no `undefined`, and reads `null` */
const withoutUndefined = (value: unknown): unknown => {
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(withoutUndefined)
  // A plain object from either realm, and not a Date or a Buffer
  if (Object.prototype.toString.call(value) !== '[object Object]') return value
  return Object.fromEntries(
    Object.entries(value as object).map(([key, v]) => [key, withoutUndefined(v)])
  )
}

/**
 * v2's outcome, on a fresh instance with the given options, with v2's
 * `undefined` compared as `null`, as the differential compares it
 */
export const v2Outcome = async (expression: unknown, options: object = {}) => {
  const fig = new FigTreeEvaluator(options as FigTreeOptions)
  try {
    return { value: withoutUndefined(await fig.evaluate(clone(expression) as EvaluatorNode)) }
  } catch {
    return { error: true } as const
  }
}

/** v3's outcome on the instance given */
export const v3Outcome = async (
  fig: FigTree,
  expression: unknown,
  data?: Record<string, unknown>
) => {
  try {
    return { value: await fig.evaluate(expression, data === undefined ? {} : { data }) }
  } catch {
    return { error: true } as const
  }
}

/** The errors v3's `validate()` finds, by code and path */
export const v3Errors = (fig: FigTree, expression: unknown, data?: Record<string, unknown>) =>
  fig
    .validate(expression, data === undefined ? {} : { data })
    .issues.filter(({ severity }) => severity === 'error')
    .map(({ code, path, message }) => ({ code, path, message }))

/**
 * A request as either engine sent it: the full URL with its query in a fixed
 * order, the headers an expression set (not the JSON pair each engine adds),
 * and a POST's body
 */
export interface SentRequest {
  method: string
  url: string
  headers: Record<string, unknown>
  body?: unknown
}

const sentUrl = (url: string, query: Record<string, unknown> = {}) => {
  const parsed = new URL(url)
  for (const [key, value] of Object.entries(query)) parsed.searchParams.append(key, String(value))
  parsed.searchParams.sort()
  return parsed.toString()
}

const expressionHeaders = (headers: Record<string, unknown> = {}) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([key]) => !['accept', 'content-type'].includes(key.toLowerCase())
    )
  )

export const sentRequest = (
  method: string,
  url: string,
  query: Record<string, unknown> | undefined,
  headers: Record<string, unknown> | undefined,
  body: unknown
): SentRequest => ({
  method,
  url: sentUrl(url, query),
  headers: expressionHeaders(headers),
  ...(method === 'post' && { body }),
})

interface V2HttpRequest {
  url: string
  params?: Record<string, unknown>
  data?: unknown
  headers?: Record<string, unknown>
}

/** v2's HTTP client over one response, logging what v2 sent */
export const v2HttpClient = (response: unknown, sent: SentRequest[]) => {
  const answer = (method: string) => async (request: V2HttpRequest) => {
    sent.push(sentRequest(method, request.url, request.params, request.headers, request.data))
    return clone(response)
  }
  return {
    get: answer('get'),
    post: answer('post'),
    throwError: (error: unknown) => {
      throw error
    },
  }
}

/** A query as either engine sent it, a missing `values` counting as `[]` */
export interface SentQuery {
  text: string
  values: unknown
}

/** v2's SQL connection over fixed rows, logging what v2 sent */
export const v2SqlConnection = (rows: unknown[], sent: SentQuery[]) => ({
  query: async ({ query, values }: { query: string; values?: unknown }) => {
    sent.push({ text: query, values: values ?? [] })
    return clone(rows)
  },
})
