/**
 * The one path resolver ("One path resolver" in
 * docs-dev/v3-specs/v3-implementation-notes.md, "References & scoping" in
 * docs-dev/v3-specs/v3-api.md; get-operator grammar in
 * docs-dev/v3-specs/v3-operator-parameters-2.md). A from-scratch replacement
 * for `object-property-extractor` — wrapping it was rejected because its
 * `in`-based lookup leaks prototype properties, it projects implicitly, and it
 * signals absence by throwing/falling back instead of reporting
 * found-vs-missing.
 *
 * Grammar (string form): dot-separated keys, `[n]` numeric index, `[*]`
 * wildcard projection, and `["…"]` / `['…']` quoted keys (single/double
 * quotes; backslash escapes the quote char and backslash). A segments-array
 * form is also accepted: strings are keys VERBATIM (never parsed), numbers are
 * indices.
 *
 * Resolution: own-enumerable properties only (no `__proto__`/`constructor`
 * leakage); numeric segments index arrays / key objects JS-style; drilling
 * through null / a scalar / an opaque value yields a miss (so no string
 * `.length` leakage); `[*]` maps the path remainder over an array, a
 * per-element miss becoming a `null` slot. Absence is reported as
 * `{ found: false }` — the `strictDataPaths`, `missingPathDefault`, `firstOf`
 * and `fallback` layers build on that signal in later phases.
 */

/** Sentinel for the `[*]` projection segment. */
export const WILDCARD: unique symbol = Symbol('figtree.path.wildcard')
export type Wildcard = typeof WILDCARD
export type PathSegment = string | number | Wildcard

export interface ResolveResult {
  found: boolean
  value: unknown
}

const MISS: ResolveResult = { found: false, value: undefined }

/**
 * Parse a string path into segments. Throws a plain `Error` on malformed input;
 * callers wrap it (a literal path at `validate()`, a dynamic path at runtime).
 */
export const parsePath = (path: string): PathSegment[] => {
  const segments: PathSegment[] = []
  let key = ''
  let keyStarted = false
  let i = 0

  const flushKey = () => {
    if (keyStarted) {
      segments.push(key)
      key = ''
      keyStarted = false
    }
  }

  while (i < path.length) {
    const ch = path[i]
    if (ch === '.') {
      flushKey()
      i++
      continue
    }
    if (ch === '[') {
      flushKey()
      const { segment, next } = parseBracket(path, i)
      segments.push(segment)
      i = next
      continue
    }
    key += ch
    keyStarted = true
    i++
  }
  flushKey()
  return segments
}

const parseBracket = (path: string, start: number): { segment: PathSegment; next: number } => {
  let i = start + 1
  if (i >= path.length) throw invalidPath(path, 'unterminated "["')
  const ch = path[i]

  // Wildcard projection: [*]
  if (ch === '*') {
    if (path[i + 1] !== ']') throw invalidPath(path, 'expected "]" after "[*"')
    return { segment: WILDCARD, next: i + 2 }
  }

  // Quoted key: ["…"] or ['…']
  if (ch === '"' || ch === "'") {
    const quote = ch
    i++
    let str = ''
    while (i < path.length) {
      const c = path[i]
      if (c === '\\') {
        const escaped = path[i + 1]
        if (escaped === undefined) throw invalidPath(path, 'trailing escape in quoted key')
        str += escaped
        i += 2
        continue
      }
      if (c === quote) {
        if (path[i + 1] !== ']') throw invalidPath(path, 'expected "]" after quoted key')
        return { segment: str, next: i + 2 }
      }
      str += c
      i++
    }
    throw invalidPath(path, 'unterminated quoted key')
  }

  // Numeric index: [n]
  let digits = ''
  while (i < path.length && path[i] >= '0' && path[i] <= '9') {
    digits += path[i]
    i++
  }
  if (digits.length > 0 && path[i] === ']') {
    return { segment: Number(digits), next: i + 1 }
  }
  throw invalidPath(path, 'expected a number, "*", or a quoted key inside "[…]"')
}

const invalidPath = (path: string, detail: string): Error =>
  new Error(`Invalid path "${path}": ${detail}`)

const normalizePath = (path: string | Array<string | number>): PathSegment[] =>
  Array.isArray(path) ? path.slice() : parsePath(path)

/**
 * Resolve a path against a source value, reporting found-vs-missing
 * distinctly.
 */
export const resolvePath = (
  source: unknown,
  path: string | Array<string | number>
): ResolveResult => resolveSegments(source, normalizePath(path), 0)

const resolveSegments = (
  current: unknown,
  segments: PathSegment[],
  index: number
): ResolveResult => {
  if (index >= segments.length) return { found: true, value: current }

  const segment = segments[index]

  if (segment === WILDCARD) {
    if (!Array.isArray(current)) return MISS
    const rest = index + 1
    if (rest >= segments.length) return { found: true, value: current } // trailing [*] = identity
    const projected = current.map((element) => {
      const result = resolveSegments(element, segments, rest)
      return result.found ? result.value : null // per-element miss -> null slot
    })
    return { found: true, value: projected }
  }

  const next = readOwn(current, segment)
  if (!next.found) return MISS
  return resolveSegments(next.value, segments, index + 1)
}

/** Read one segment from a container, own-enumerable properties only. */
const readOwn = (current: unknown, segment: string | number): ResolveResult => {
  if (current === null || typeof current !== 'object') return MISS // scalar / null / opaque -> no paths

  if (Array.isArray(current)) {
    const index = typeof segment === 'number' ? segment : toIndex(segment)
    if (index === undefined || index < 0 || index >= current.length) return MISS
    return { found: true, value: current[index] }
  }

  const key = String(segment)
  if (Object.prototype.propertyIsEnumerable.call(current, key)) {
    return { found: true, value: (current as Record<string, unknown>)[key] }
  }
  return MISS
}

const toIndex = (segment: string): number | undefined =>
  /^\d+$/.test(segment) ? Number(segment) : undefined
