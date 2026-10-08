/**
 * An example's source text carried in a URL, so an "open in editor" link can
 * load it into a widget with its comments intact. The query string holds it
 * and the hash names the widget, so following the link scrolls to the widget,
 * which reads the query when it mounts.
 */
export type PlaygroundSeed = { expression: string; data?: string }

const PARAM = 'example'

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

export const playgroundHref = (seed: PlaygroundSeed, widgetId: string): string =>
  `?${PARAM}=${toBase64Url(JSON.stringify(seed))}#${widgetId}`

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
