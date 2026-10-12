/**
 * The constancy probe ("Skip the compile for inert inputs" in
 * docs-dev/v3-specs/v3-implementation-notes.md): a recognition-only scan
 * over a raw value that answers "would evaluating this be identity?"
 * without allocating a compiled tree. It bails at the first thing the
 * compiler would evaluate OR normalize, because either makes the compile result
 * differ from the input:
 *
 * - evaluable: an `operator` / `fragment` key, any `$name` key (a
 *   recognized one is a call, `literal` included, and an unrecognized one
 *   an error the compile must report), a reference string, an illegal use
 *   of a reference namespace (bare `$vars`), a `vars` block;
 * - normalized away: a `//` comment key, an `undefined` value (dropped from
 *   objects, `null` in arrays).
 *
 * Plain strings, unrecognized `$strings`, primitives and opaque values are
 * constant and pass through by identity. No answer depends on what is
 * registered, so the probe never reads the registry. The property test in
 * test/probe.test.ts pins it to the compiler: `probeConstant(x).constant`
 * holds exactly when the compile is error-free and its root a constant
 * holding x.
 *
 * `evaluate()` runs it before parsing and returns the input untouched when
 * it says constant. It recurses, so it carries the same depth ceiling as
 * the walk; a value beyond the ceiling is reported not-constant so the
 * compile gets to report the error. `depth` is the measured nesting (a
 * constant input's `maxDepth`), so the user's `maxDepth` still applies to
 * inert input.
 *
 * Its one variant, `probeStaticFallback`, also accepts `$error` reads,
 * recording where each sits. The same property test pins it to the
 * compiler's `staticFallbackOf`.
 */
import { isPlainDataObject } from '../plainData'
import { resolveOperator, type OperatorRegistry } from '../registry'
import { recognizeReference } from './references'
import { DEPTH_CEILING } from './grammar'
import type { ErrorRead, NodePath, StaticFallback } from './artifact'

export interface ProbeResult {
  constant: boolean
  /** Nesting depth measured up to the bail point or the ceiling. */
  depth: number
}

export const probeConstant = (value: unknown): ProbeResult => {
  const state: ProbeState = { maxDepth: 0 }
  const constant = scan(state, value, 0)
  return { constant, depth: state.maxDepth }
}

/**
 * `value` as a static fallback (src/compile/artifact.ts), where the
 * compiler would compile it to one whose value is `value` as written:
 * constant apart from `$error` reads, with nothing to normalize. Undefined
 * for anything else. Registration builds an `operatorDefaults` fallback
 * with it, since a default is never compiled.
 */
export const probeStaticFallback = (value: unknown): StaticFallback | undefined => {
  const state: ProbeState = { maxDepth: 0 }
  if (!scan(state, value, 0, [])) return undefined
  return state.reads === undefined ? { value } : { value, reads: state.reads }
}

interface ProbeState {
  maxDepth: number
  /** The variant's: each `$error` read, where it sits */
  reads?: ErrorRead[]
}

/** `at` is where `value` sits, passed by the variant only. */
const scan = (state: ProbeState, value: unknown, depth: number, at?: NodePath): boolean => {
  if (depth > DEPTH_CEILING) return false
  if (depth > state.maxDepth) state.maxDepth = depth

  if (value === undefined) return false
  if (typeof value === 'string') {
    const recognized = recognizeReference(value)
    if (recognized.kind === 'reference' && recognized.namespace === 'error' && at !== undefined) {
      ;(state.reads ??= []).push({ at, segments: recognized.segments })
      return true
    }
    return recognized.kind === 'plain' || recognized.kind === 'unrecognized'
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!scan(state, value[i], depth + 1, at && [...at, i])) return false
    }
    return true
  }
  if (isPlainDataObject(value)) {
    for (const key in value) {
      if (key === 'operator' || key === 'fragment' || key === 'vars' || key === '//') return false
      if (key.startsWith('$')) return false
    }
    for (const key in value) {
      if (!scan(state, value[key], depth + 1, at && [...at, key])) return false
    }
    return true
  }
  // null, numbers, booleans, and opaque values (Date, Map, class instances,
  // functions) — constant by identity
  return true
}

/**
 * Does a `$name` key invoke something registered, or `literal`? The one
 * answer to the recognition question, for the walk and its classifiers.
 */
export const isRecognizedShorthand = (registry: OperatorRegistry, name: string): boolean =>
  name === 'literal' ||
  resolveOperator(registry, name) !== undefined ||
  registry.fragments.has(name)
