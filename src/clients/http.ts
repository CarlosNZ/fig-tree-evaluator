/**
 * The bundled `HttpClient` wrappers ("The client contracts" in
 * docs-dev/v3-specs/v3-operator-contract.md; the root-entry inventory in
 * docs-dev/v3-specs/v3-packaging.md).
 *
 * Ported from v2's `httpClients.ts` — the one sanctioned code port, being
 * engine-independent. What carries over is the error-payload extraction.
 * What does not: the window-sniffing that adopted `window.fetch` behind
 * the host's back (registration is the visible act now), the query-string
 * assembly (the operator owns URL building in v3), the `console.log`s, and
 * the node-fetch type imports.
 *
 * `axios` is never a dependency of this package, so its types are not
 * imported either — that would put `axios` in the emitted `.d.ts` and
 * demand it of every consumer. Each wrapper declares the minimum
 * structural shape it actually calls, which the real import satisfies.
 */
import { ErrorCodes } from '../errorCodes'
import { FigTreeError } from '../FigTreeError'
import type { HttpClient, HttpRequest } from '../types'
import { httpFailure, invalidResponse } from './failures'

/** The fetch surface this wrapper uses, and nothing more. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  }
) => Promise<FetchResponseLike>

export interface FetchResponseLike {
  ok: boolean
  status: number
  statusText: string
  url: string
  /**
   * Read as TEXT, never `.json()`. The parse has to be ours so an empty
   * body can be `null` and a non-JSON body can carry its raw text into
   * `errorData` — v2 called `.json()` before checking `ok` and inherited
   * both bugs, turning an HTML 502 into a parse error.
   */
  text(): Promise<string>
}

/**
 * The axios surface: a callable and nothing else, so an instance from
 * `axios.create()` fits as well as the import. axios attaches its statics,
 * `isAxiosError` among them, to the default export alone.
 */
export type AxiosLike = (config: {
  url: string
  method: 'get' | 'post'
  headers?: Record<string, string>
  data?: unknown
  signal?: AbortSignal
}) => Promise<{ data: unknown; status: number; statusText: string }>

/**
 * What axios throws. Every `AxiosError` carries its own `isAxiosError`
 * flag, which is all `axios.isAxiosError()` reads.
 */
export interface AxiosErrorLike {
  isAxiosError: true
  message: string
  config?: { url?: string }
  response?: { status: number; statusText: string; data: unknown }
}

/**
 * A constructor's refusal. It runs in the host's setup code, outside any
 * evaluation, so nothing would wrap an `OperatorFailure` into the
 * `FigTreeError` the host is promised: it is thrown as one, like the
 * instance's own options errors.
 */
const configError = (message: string) =>
  new FigTreeError({ code: ErrorCodes.invalidOptions, message, path: [] })

export class FetchClient implements HttpClient {
  private readonly supplied?: FetchLike

  /**
   * No argument adopts the environment's global `fetch` — browser, Node
   * ≥18, Deno, Bun. Only *implicit* adoption died with v2's window
   * sniffing: writing `new FetchClient()` is the visible act, and
   * registering the operators it backs is a second one.
   *
   * The absence check is here, at construction, which is what makes
   * `httpOperators()` on a runtime without fetch a loud registration
   * error rather than a surprise at the first request.
   */
  constructor(fetchImpl?: FetchLike) {
    if (fetchImpl === undefined && typeof globalThis.fetch !== 'function')
      throw configError(
        'FetchClient(): this runtime has no global fetch — pass one, ' +
          'new FetchClient(myFetch), or use another client such as new AxiosClient(axios)'
      )
    this.supplied = fetchImpl
  }

  /**
   * An arrow field rather than a method, so a torn-off `request` keeps its
   * client: a host wiring `{ request: myClient.request }` is doing nothing
   * unreasonable and should not get a `this`-shaped mystery.
   *
   * The global is resolved per call rather than captured, and invoked
   * against `globalThis`, because a browser `fetch` torn off its global
   * throws "Illegal invocation".
   */
  request = async (req: HttpRequest): Promise<unknown> => {
    const call = this.supplied ?? (globalThis.fetch as unknown as FetchLike)
    const response = await call.call(globalThis, req.url, {
      method: req.method.toUpperCase(),
      headers: req.headers,
      ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
      signal: req.signal,
    })

    // Read once, classify after: an empty 204 and a non-JSON 200 are
    // different answers, and `.json()` collapses them into one throw
    const text = await response.text()
    if (!response.ok)
      throw httpFailure({
        status: response.status,
        statusText: response.statusText,
        url: response.url || req.url,
        response: parseOrRaw(text),
      })
    return parseBody(text, response.url || req.url, response.status)
  }
}

export class AxiosClient implements HttpClient {
  constructor(private readonly axios: AxiosLike) {
    if (typeof axios !== 'function')
      throw configError(
        'AxiosClient(axios): pass the axios import or an instance from axios.create() — ' +
          'new AxiosClient(axios)'
      )
  }

  request = async (req: HttpRequest): Promise<unknown> => {
    try {
      const response = await this.axios({
        url: req.url,
        method: req.method,
        headers: req.headers,
        // Serialised here, as FetchClient does: axios sends a string that
        // parses as JSON unquoted (and trimmed), so a body of `'123'` would
        // go out as a number. JSON text it is given goes out as it is
        ...(req.body !== undefined ? { data: JSON.stringify(req.body) } : {}),
        signal: req.signal,
      })
      // axios parses JSON itself, and hands back '' for an empty body —
      // the 204 rule restated in axios' vocabulary
      return response.data === '' || response.data === undefined ? null : response.data
    } catch (error) {
      if (isAxiosError(error) && error.response)
        throw httpFailure({
          status: error.response.status,
          statusText: error.response.statusText,
          // `config.url` only, never `config` whole: an axios config
          // carries the request headers, which is exactly the leak the
          // never-echo rule exists to prevent
          url: error.config?.url ?? req.url,
          response: error.response.data,
        })
      // A transport error is the operator's to classify: it becomes
      // `request-failure`, keeping only its message, since an axios error
      // carries its config, headers included. An abort is classified from
      // the engine's own signals, whatever is thrown
      throw error
    }
  }
}

const isAxiosError = (error: unknown): error is AxiosErrorLike =>
  typeof error === 'object' && error !== null && (error as AxiosErrorLike).isAxiosError === true

/** An empty success — a 204, or a 200 with nothing in it — is `null`. */
const parseBody = (text: string, url: string, status: number): unknown => {
  if (text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch {
    throw invalidResponse(`response was not JSON (${status}): ${url}`, url, text)
  }
}

/** An error body may or may not be JSON; carry whichever it turned out to be */
const parseOrRaw = (text: string): unknown => {
  if (text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
