import type { FetchLike } from 'fig-tree-evaluator'

/**
 * The `fetch` the site's HTTP operators use. In the browser it's the real
 * one, so a reader watching the network tab sees every request an example
 * sends. At build time it replays recorded responses instead
 * (./httpReplay.ts), so the build stays offline and every result is the same
 * from one build to the next.
 */
export const siteFetch: FetchLike | undefined = import.meta.env.SSR
  ? async (url, init) => (await import('./httpReplay')).serverFetch(url, init)
  : undefined
