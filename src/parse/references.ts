/**
 * Reference-token recognition ("Reference grammar" in
 * docs-dev/v3-specs/v3-api.md): the token rule, namespace-alias
 * normalization, and the bare-namespace legality rules. Pure classification
 * — scope resolution (does the var exist, are we inside an iterator) is the
 * chunk-3.3 layer's job.
 */
import { parsePath, WILDCARD, type PathSegment } from '../primitives'
import type { ReferenceNamespace } from './artifact'

/** Namespace tokens, canonical and single-character alias forms. */
const NAMESPACE_TOKENS: Record<string, ReferenceNamespace> = {
  data: 'data',
  d: 'data',
  vars: 'vars',
  v: 'vars',
  params: 'params',
  p: 'params',
  element: 'element',
  e: 'element',
  index: 'index',
  i: 'index',
}

export type ReferenceRecognition =
  /** A recognized, well-formed reference. */
  | { kind: 'reference'; namespace: ReferenceNamespace; segments: PathSegment[] }
  /** A recognized namespace used illegally (bare $vars, drilled $index…). */
  | { kind: 'invalid'; namespace: ReferenceNamespace; reason: string }
  /** $-prefixed but no recognized namespace token — inert, warned. */
  | { kind: 'unrecognized' }
  /** Not $-prefixed — ordinary data. */
  | { kind: 'plain' }

/** Split a `$`-prefixed string into its sigil token and drill remainder. */
export const splitSigilToken = (value: string): { token: string; rest: string } | null => {
  if (!value.startsWith('$')) return null
  const token = /^\$([^.[]*)/.exec(value)![1]
  return { token, rest: value.slice(1 + token.length) }
}

/** Parse a drill remainder (`.a[0]`, `[2].b`, or empty) into segments. */
export const parseDrill = (rest: string): PathSegment[] => {
  if (rest === '') return []
  return parsePath(rest.startsWith('.') ? rest.slice(1) : rest)
}

/**
 * Classify a string per the token rule: a reference iff it starts with
 * `$<namespace>` (canonical or alias) followed by end-of-string, `.` or `[`.
 * Case-sensitive; whole-string only (interpolation is buildString's job).
 */
export const recognizeReference = (value: string): ReferenceRecognition => {
  const split = splitSigilToken(value)
  if (split === null) return { kind: 'plain' }
  const { token, rest } = split
  const namespace = NAMESPACE_TOKENS[token]
  if (namespace === undefined) return { kind: 'unrecognized' }

  if (rest === '') {
    // Bare namespaces: $data = the whole merged object; $element / $index
    // are bare-legal; bare $vars / $params name nothing
    if (namespace === 'vars' || namespace === 'params')
      return {
        kind: 'invalid',
        namespace,
        reason: `bare '$${token}' names nothing — reference a specific ${
          namespace === 'vars' ? 'var' : 'parameter'
        }`,
      }
    return { kind: 'reference', namespace, segments: [] }
  }

  if (namespace === 'index')
    return { kind: 'invalid', namespace, reason: "'$index' is bare-only — it cannot be drilled" }

  try {
    return { kind: 'reference', namespace, segments: parseDrill(rest) }
  } catch (error) {
    return { kind: 'invalid', namespace, reason: (error as Error).message }
  }
}

/**
 * Render segments back to the shared string grammar — dependency-list
 * spellings (`orders[*].total`), deduplication keys, messages.
 */
export const renderSegments = (segments: PathSegment[]): string =>
  segments
    .map((segment, i) => {
      if (typeof segment === 'number') return `[${segment}]`
      if (segment === WILDCARD) return '[*]'
      return i === 0 ? String(segment) : `.${String(segment)}`
    })
    .join('')
