import type { ExampleActionName } from '../components/playground/exampleActions'

/**
 * An example's source text carried in a URL, so an "open in editor" link can
 * load it into the Playground page's widget with its comments intact. The
 * query string holds it and the hash names the widget, so following the link
 * scrolls to the widget, which reads the query when it mounts.
 */
export type PlaygroundSeed = {
  expression: string
  data?: string
  fragments?: boolean
  customOperators?: boolean
  noCache?: boolean
  action?: ExampleActionName
}

/** Not `example`, which names one of the Playground's own (PlaygroundPage.tsx). */
const PARAM = 'seed'

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (encoded: string): string => {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/** The Playground page, and the id of its widget. */
const PLAYGROUND_PAGE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/playground/`
const PLAYGROUND_WIDGET = 'playground'

export const playgroundHref = (seed: PlaygroundSeed): string =>
  `${PLAYGROUND_PAGE}?${PARAM}=${toBase64Url(JSON.stringify(seed))}#${PLAYGROUND_WIDGET}`

/** The seed in the current URL, or null if there is none or it is unreadable. */
export const readPlaygroundSeed = (search: string): PlaygroundSeed | null => {
  const encoded = new URLSearchParams(search).get(PARAM)
  if (!encoded) return null
  try {
    const seed = JSON.parse(fromBase64Url(encoded))
    return typeof seed?.expression === 'string' ? seed : null
  } catch {
    return null
  }
}
