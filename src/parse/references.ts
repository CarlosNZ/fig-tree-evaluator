/**
 * Reference-token recognition ("Reference grammar" and "Bare namespace
 * forms" in docs-dev/v3-specs/v3-api.md): the token rule, namespace-alias
 * normalization, and the bare-namespace legality rules. Pure classification
 * — scope resolution (does the var exist, are we inside an iterator) is the
 * chunk-3.3 layer's job.
 */
import { ErrorCodes } from '../errorCodes'
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
  /**
   * A recognized namespace used illegally (bare $vars, drilled $index…).
   * `code` overrides the generic `invalid-reference` where the rule broken
   * has a name of its own.
   */
  | { kind: 'invalid'; namespace: ReferenceNamespace; reason: string; code?: string }
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
    // The namespaces divide on whether they name a VALUE or a SET. $data
    // and $element name a value, so the bare form is that value; $index is
    // bare-only by grammar. $vars and $params name a set, and the bare form
    // is legal only where that set has declared, finite, local membership:
    // a call's declared parameters do, a scope chain does not — its
    // membership is every var every enclosing node declared, shadowing
    // included, and materializing it would force all of them to evaluate
    if (namespace === 'vars')
      return {
        kind: 'invalid',
        namespace,
        code: ErrorCodes.bareVars,
        reason: "'$vars' must name a var — there is no whole-scope value",
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
 *
 * Lossless, which is what lets the render double as a canonical identity:
 * dot-joining alone rendered a single key holding a dot (`['first.last']`)
 * exactly like two levels (`first.last`), so two different reads
 * deduplicated into one and any re-parse split the key. A key the dot
 * grammar cannot carry takes the bracket-quoted form the grammar already
 * parses, so `parsePath(renderSegments(s))` returns `s` for every `s`.
 */
export const renderSegments = (segments: PathSegment[]): string =>
  segments
    .map((segment, i) => {
      if (typeof segment === 'number') return `[${segment}]`
      if (segment === WILDCARD) return '[*]'
      return renderKey(segment, i === 0)
    })
    .join('')

/** Keys the dot grammar cannot carry unquoted (empty included, below). */
const NEEDS_QUOTING = /[.[\]"\\]/

const renderKey = (key: string, first: boolean): string => {
  if (key === '' || NEEDS_QUOTING.test(key))
    return `["${key.replace(/[\\"]/g, (char) => `\\${char}`)}"]`
  return first ? key : `.${key}`
}

/**
 * A `$data` read in the reference grammar, for messages: `$data.user.name`,
 * and `$data[0].x` where the path opens with an index or a quoted key.
 */
export const renderDataReference = (segments: PathSegment[]): string => {
  const rendered = renderSegments(segments)
  if (rendered === '') return '$data'
  return rendered.startsWith('[') ? `$data${rendered}` : `$data.${rendered}`
}
