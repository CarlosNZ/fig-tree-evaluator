/**
 * The site's `fetch` at build time (./http.ts): the recorded responses,
 * replayed. Server-only, since it needs Node.
 *
 * The recordings are written by `pnpm record:http`, which builds the site
 * against the real APIs and keeps every response the build asked for. A
 * request with no recording fails, naming that command. That failure is an
 * ordinary failed request, which a fallback in the example would catch and
 * hide, so each one is also noted against the evaluation that sent it, for
 * `trackMissing` to report.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { FetchLike } from 'fig-tree-evaluator'

export const serverFetch: FetchLike = (url, init = {}) =>
  process.env.DOCS_HTTP === 'record' ? record(url, init) : replay(url, init)

/**
 * The requests with no recording, for the evaluation running in this async
 * context. Examples on a page render concurrently, so a shared list couldn't
 * say which example sent which request.
 */
const missing = new AsyncLocalStorage<string[]>()

/**
 * Run an evaluation, failing if it sent a request with no recording, even
 * one whose failure a fallback caught.
 */
export const trackMissing = async <T>(run: () => Promise<T>): Promise<T> => {
  const keys: string[] = []
  const outcome = missing.run(keys, run)
  // Settled before `keys` is read, without throwing here
  await outcome.catch(() => {})
  if (keys.length > 0)
    throw new Error(
      `no recorded response for ${keys.join(', ')}: run \`pnpm record:http\` in docs-site/`
    )
  return outcome
}

type Init = NonNullable<Parameters<FetchLike>[1]>

interface Recording {
  status: number
  statusText: string
  /** The body parsed, when it's JSON, so the recordings file is readable. */
  json?: unknown
  text?: string
}

const RECORDINGS = 'src/lib/httpRecordings.json'

const requestKey = (url: string, { method = 'GET', body }: Init) =>
  body === undefined ? `${method} ${url}` : `${method} ${url} ${body}`

const replay = async (url: string, init: Init) => {
  const { default: recordings } = await import('./httpRecordings.json')
  const key = requestKey(url, init)
  const hit = (recordings as Record<string, Recording>)[key]
  if (hit === undefined) {
    missing.getStore()?.push(key)
    throw new Error(`no recorded response for ${key}: run \`pnpm record:http\` in docs-site/`)
  }
  const body = hit.json === undefined ? (hit.text ?? '') : JSON.stringify(hit.json)
  return new Response(body, { status: hit.status, statusText: hit.statusText })
}

// Starts empty, so a recording no example asks for any more is dropped
const recorded: Record<string, Recording> = {}

const record = async (url: string, init: Init) => {
  const response = await fetch(url, init)
  const text = await response.text()
  const { status, statusText } = response
  let entry: Recording
  try {
    entry = { status, statusText, json: JSON.parse(text) }
  } catch {
    entry = { status, statusText, text }
  }
  recorded[requestKey(url, init)] = entry
  const sorted = Object.fromEntries(
    Object.keys(recorded)
      .sort()
      .map((key) => [key, recorded[key]])
  )
  const { writeFileSync } = await import('node:fs')
  writeFileSync(RECORDINGS, JSON.stringify(sorted, null, 2) + '\n')
  return new Response(text, { status, statusText })
}
