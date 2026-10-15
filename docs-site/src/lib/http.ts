import type { FetchLike } from 'fig-tree-evaluator'

/**
 * The `fetch` the site's HTTP operators use. In the browser it's the real
 * one, so a reader watching the network tab sees every request an example
 * sends. At build time it replays recorded responses instead, so the build
 * stays offline and every result is the same from one build to the next.
 *
 * The recordings are written by `pnpm record:http`, which builds the site
 * against the real APIs and keeps every response the build asked for. A
 * request with no recording fails, naming that command.
 */
export const siteFetch: FetchLike | undefined = import.meta.env.SSR
  ? (url, init = {}) => (process.env.DOCS_HTTP === 'record' ? record(url, init) : replay(url, init))
  : undefined

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
  if (hit === undefined)
    throw new Error(`no recorded response for ${key}: run \`pnpm record:http\` in docs-site/`)
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
