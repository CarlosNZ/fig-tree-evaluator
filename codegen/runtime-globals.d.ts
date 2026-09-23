/**
 * The globals the library source may use beyond ES2022 ("Module format &
 * platform floor" in docs-dev/v3-specs/v3-packaging.md), each declared only
 * as far as the source uses it.
 *
 * tsconfig.globals.json typechecks src/ against ES2022 plus this file and no
 * other ambient types. The build's own config includes @types/node, so a
 * Node-only global — `Buffer`, `process`, `setImmediate` — compiles there
 * and breaks the package in a browser, Deno or a worker; under this check it
 * is an error. Every global below exists on all of those runtimes, so adding
 * one widens what the package assumes of its host: a spec change first.
 */

interface AbortSignal {
  readonly aborted: boolean
  readonly reason: unknown
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: 'abort', listener: () => void): void
}
declare var AbortSignal: { prototype: AbortSignal }

interface AbortController {
  readonly signal: AbortSignal
  abort(reason?: unknown): void
}
declare var AbortController: { prototype: AbortController; new (): AbortController }

declare function setTimeout(handler: () => void, timeout?: number): unknown
declare function clearTimeout(handle: unknown): void

declare var performance: { now(): number }

interface URL {
  readonly href: string
  toString(): string
}
declare var URL: { prototype: URL; new (url: string, base?: string | URL): URL }

interface URLSearchParams {
  append(name: string, value: string): void
  toString(): string
}
declare var URLSearchParams: { prototype: URLSearchParams; new (): URLSearchParams }

/**
 * Read only by `FetchClient`'s no-argument default, at construction — the
 * one sanctioned probe of an optional global; a host without it passes its
 * own fetch or another client.
 */
declare var fetch: unknown
