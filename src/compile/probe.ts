/**
 * The constancy probe ("Skip the compile for inert inputs" in
 * docs-dev/v3-specs/v3-implementation-notes.md): a recognition-only scan
 * over a raw value that answers "would evaluating this be identity?"
 * without allocating a compiled tree. It bails at the first thing the
 * compiler would evaluate OR normalize, because either makes the compile result
 * differ from the input:
 *
 * - evaluable: an `operator` / `fragment` key, a recognized `$name`
 *   shorthand key (`literal` included), a reference string, an illegal use
 *   of a reference namespace (bare `$vars`), a `vars` block;
 * - normalized away: a `//` comment key, an `undefined` value (dropped from
 *   objects, `null` in arrays).
 *
 * Plain strings, unrecognized `$strings`, primitives and opaque values are
 * constant and pass through by identity. The probe is the single shared
 * implementation of this question (the compiler consumes it too), and the
 * property test in test/probe.test.ts pins it to the compiler:
 * `probeConstant(x).constant === (compile(x).root is a constant holding x)`.
 *
 * `evaluate()` runs it before parsing and returns the input untouched when
 * it says constant. It recurses, so it carries the same depth ceiling as
 * the walk; a value beyond the ceiling is reported not-constant so the
 * compile gets to report the error. `depth` is the measured nesting (a
 * constant input's `maxDepth`), so the user's `maxDepth` still applies to
 * inert input.
 */
import { isPlainDataObject } from '../utils'
import { resolveOperator, type OperatorRegistry } from '../registry'
import { recognizeReference } from './references'
import { DEPTH_CEILING } from './grammar'

export interface ProbeResult {
  constant: boolean
  /** Nesting depth measured up to the bail point or the ceiling. */
  depth: number
}

export const probeConstant = (value: unknown, registry: OperatorRegistry): ProbeResult => {
  const state: ProbeState = { registry, maxDepth: 0 }
  const constant = scan(state, value, 0)
  return { constant, depth: state.maxDepth }
}

interface ProbeState {
  registry: OperatorRegistry
  maxDepth: number
}

const scan = (state: ProbeState, value: unknown, depth: number): boolean => {
  if (depth > DEPTH_CEILING) return false
  if (depth > state.maxDepth) state.maxDepth = depth

  if (value === undefined) return false
  if (typeof value === 'string') {
    const kind = recognizeReference(value).kind
    return kind === 'plain' || kind === 'unrecognized'
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!scan(state, value[i], depth + 1)) return false
    }
    return true
  }
  if (isPlainDataObject(value)) {
    for (const key in value) {
      if (key === 'operator' || key === 'fragment' || key === 'vars' || key === '//') return false
      if (key.startsWith('$') && isRecognizedShorthand(state.registry, key.slice(1))) return false
    }
    for (const key in value) {
      if (!scan(state, value[key], depth + 1)) return false
    }
    return true
  }
  // null, numbers, booleans, and opaque values (Date, Map, class instances,
  // functions) — constant by identity
  return true
}

/**
 * Does a `$name` key invoke something registered, or `literal`? The one
 * answer to the recognition question, for the probe and the walk alike.
 */
export const isRecognizedShorthand = (registry: OperatorRegistry, name: string): boolean =>
  name === 'literal' ||
  resolveOperator(registry, name) !== undefined ||
  registry.fragments.has(name)
