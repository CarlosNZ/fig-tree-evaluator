/**
 * One data read, converted between a reference string and a `get` node
 * ("`toGet` and `toReference`" and "Spellings" in
 * docs-dev/v3-specs/v3-format.md). Neither direction needs a registry: a
 * reference is grammar, and `get` is a core operator whose positions are
 * fixed (src/operators/getShape.ts).
 *
 * Every function here answers `null` for "no such form" and never throws,
 * so the editor can ask before it offers a conversion.
 */
import {
  bareNamespace,
  recognizeReference,
  renderSegments,
  splitSigilToken,
} from '../compile/references'
import { singlePositionalTarget } from '../compile/grammar'
import { GET_POSITIONAL } from '../operators/getShape'
import { parsePath, WILDCARD } from '../primitives/path'
import { isPlainDataObject } from '../utils'
import { positionalToNamed } from './read'
import type { ReferenceNamespace } from '../compile/artifact'
import type { Spelling } from '../formatTypes'

/** A get node's parameters by name, as read from any of its forms. */
export type GetParams = Map<string, unknown>

const GET_SHAPE = { positionalParams: GET_POSITIONAL, restParam: null }

/** The keys a get node may carry and still have a reference form. */
const GET_KEYS = new Set(['path', 'from', 'default'])

/**
 * Each namespace's single-character alias token: the inverse of
 * `NAMESPACE_TOKENS` in src/compile/references.ts.
 */
const NAMESPACE_ALIASES: Record<ReferenceNamespace, string> = {
  data: 'd',
  vars: 'v',
  params: 'p',
  element: 'e',
  index: 'i',
}

/** A namespace token in the requested spelling; `preserve` keeps `token`. */
const spellToken = (token: string, namespace: ReferenceNamespace, spelling: Spelling): string => {
  if (spelling === 'canonical') return namespace
  if (spelling === 'alias') return NAMESPACE_ALIASES[namespace]
  return token
}

/**
 * A whole-string reference with its namespace token respelled, the rest of
 * its text as written. Anything that isn't a well-formed reference comes
 * back unchanged.
 */
export const respell = (value: string, spelling: Spelling): string => {
  if (spelling === 'preserve') return value
  const recognition = recognizeReference(value)
  if (recognition.kind !== 'reference') return value
  const { token, rest } = splitSigilToken(value)!
  return `$${spellToken(token, recognition.namespace, spelling)}${rest}`
}

/** A drill's path text: as written, without its leading `.`. */
const pathText = (drill: string): string => (drill.startsWith('.') ? drill.slice(1) : drill)

/**
 * A reference string as a canonical `get` node: `from` is the bare
 * namespace and `path` the whole drill, one shape for every namespace. A
 * `$data` read needs no `from`. For `$vars` and `$params` the path's first
 * key names the var or parameter, which the compiler moves into the source
 * (#237), so a drill opening with an index or a projection has no get
 * form. A reference with nothing left to drill reads its whole source, as
 * a get with an empty path does. `$index` has no get form: it is a number,
 * not a source a path can read into.
 */
export const referenceToGet = (
  value: unknown,
  spelling: Spelling
): Record<string, unknown> | null => {
  if (typeof value !== 'string') return null
  const recognition = recognizeReference(value)
  if (recognition.kind !== 'reference') return null
  const { namespace, segments } = recognition
  if (namespace === 'index') return null
  const { token, rest } = splitSigilToken(value)!
  const path = pathText(rest)
  if (namespace === 'data') return { operator: 'get', path }
  if (namespace !== 'element' && segments.length > 0 && typeof segments[0] !== 'string') return null
  return { operator: 'get', path, from: `$${spellToken(token, namespace, spelling)}` }
}

/**
 * A literal path's segments, or `null` when it has no reference form: a
 * computed path, one that doesn't parse, and any part starting with `$`,
 * which inside an iterator's `as` scope may be the element rather than a
 * key.
 */
const literalSegments = (path: unknown): (string | number)[] | null => {
  if (typeof path === 'string') {
    if (path.startsWith('$')) return null
    try {
      return parsePath(path) as (string | number)[]
    } catch {
      return null
    }
  }
  if (!Array.isArray(path)) return null
  for (const segment of path) {
    const valid =
      (typeof segment === 'string' && !segment.startsWith('$')) ||
      (typeof segment === 'number' && Number.isInteger(segment) && segment >= 0)
    if (!valid) return null
  }
  return path as (string | number)[]
}

/**
 * A get node's parameters as a reference, or `null` when they have none,
 * which includes a path read from a projection in `from`. With no `from`,
 * the read is of `$data`, which has no spelling of its own to keep:
 * `preserve` writes the alias, as short is the point. A bare `$vars` or
 * `$params` in `from` names the var or parameter by the path's first key
 * (#237), so the path has to open with one.
 */
export const paramsToReference = (params: GetParams, spelling: Spelling): string | null => {
  if (params.has('default')) return null
  const segments = literalSegments(params.get('path'))
  if (segments === null) return null

  const rendered = renderSegments(segments)
  let base: string
  const from = params.get('from')
  if (from === undefined) base = spelling === 'canonical' ? '$data' : '$d'
  else {
    if (typeof from !== 'string') return null
    const bare = bareNamespace(from)
    if (bare === 'vars' || bare === 'params') {
      // A bare `$params` is a value, a bare `$vars` is not
      if (segments.length === 0 ? bare === 'vars' : typeof segments[0] !== 'string') return null
      base = `$${spellToken(splitSigilToken(from)!.token, bare, spelling)}`
    } else {
      const recognition = recognizeReference(from)
      if (recognition.kind !== 'reference' || recognition.namespace === 'index') return null
      // A get applies its path to the array a projection in `from` gives,
      // where a reference applies what follows the `[*]` to each element
      if (rendered !== '' && recognition.segments.includes(WILDCARD)) return null
      // A trailing `.` reads as nothing (`$data.` is `$data`), and would
      // double up against the path's own
      base = respell(from, spelling).replace(/\.$/, '')
    }
  }

  if (rendered === '') return base
  return rendered.startsWith('[') ? `${base}${rendered}` : `${base}.${rendered}`
}

/**
 * A `get` node's parameters, read from any of its forms without a registry,
 * or `null` when it isn't a get node, carries a modifier a reference can't,
 * or carries anything else a get node can't. A payload that might be a node
 * (an `operator` or `fragment` key, or any `$` key) is a computed path.
 */
export const readGetNode = (node: unknown): GetParams | null => {
  if (!isPlainDataObject(node)) return null
  const params: GetParams = new Map()

  if ('operator' in node) {
    if (node.operator !== 'get') return null
    for (const key in node) {
      const value = node[key]
      if (key === 'operator' || key === '//' || value === undefined) continue
      if (!GET_KEYS.has(key)) return null
      params.set(key, value)
    }
    return params
  }

  for (const key in node) if (key !== '$get' && key !== '//') return null
  if (!('$get' in node)) return null
  const payload = node.$get

  if (Array.isArray(payload)) {
    const named = positionalToNamed(GET_SHAPE, payload)
    if (named === null) return null
    for (const [name, value] of named) params.set(name, value)
    return params
  }
  if (isPlainDataObject(payload)) {
    for (const key in payload) {
      const value = payload[key]
      if (key === '//' || value === undefined) continue
      if (!GET_KEYS.has(key)) return null
      params.set(key, value)
    }
    return params
  }
  params.set(singlePositionalTarget(GET_SHAPE)!, payload)
  return params
}
