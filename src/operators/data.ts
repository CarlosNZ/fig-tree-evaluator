/**
 * Batch 6 — data & objects (docs-dev/v3-specs/v3-operator-parameters-2.md).
 *
 * `get` is the reference layer wearing parameters: it consumes the same
 * path resolver `"$data.…"` does, so the sugar contract
 * (`{ $get: 'a.b' }` ≡ `"$data.a.b"`) holds by construction rather than by
 * agreement. `buildObject` exists for what a plain literal cannot do —
 * keys computed at runtime, and output that must CONTAIN reserved words as
 * data.
 */
import { defineOperator } from '../defineOperator'
import { EvaluationData } from '../operatorDefinition'
import { ErrorCodes } from '../errorCodes'
import { OperatorFailure } from '../OperatorFailure'
import { renderText, resolvePath } from '../primitives'
import { emptyEntriesWarning, pathFindings, toSegments } from './shared'

export const get = defineOperator({
  name: 'get',
  category: 'data',
  description:
    'Read a path out of the evaluation data, or out of a supplied object — the dynamic face of a $data reference',
  parameters: {
    path: {
      type: ['string', 'array', 'null'],
      description:
        'Dot and bracket segments, quoted keys and the [*] projection — or an array of segments, taken verbatim',
    },
    from: {
      type: 'any',
      nullPolicy: 'value',
      default: EvaluationData,
      description:
        'The object searched instead of the evaluation data — replace, never merge; a null source is one where every path is missing',
    },
    missingPathDefault: {
      type: 'any',
      required: false,
      evaluation: 'lazy',
      description:
        'The answer when the path is missing — a stored null passes through unchanged; supplying it also opts out of strictDataPaths',
    },
  },
  positionalParams: ['path', 'missingPathDefault'],
  returns: 'any',
  validate: ({ path }) => pathFindings(path, 'path'),
  evaluate: ({ path, from, missingPathDefault }, context) => {
    const result = resolvePath(from, toSegments(path))
    // A stored `undefined` is not a value — JSON semantics at the boundary
    if (result.found) return result.value === undefined ? null : result.value

    // Absence, in the layered order: the per-site answer first, because
    // supplying one IS the strictness opt-out ("missingPathDefault: null"
    // reads "give me null instead of throwing")
    if (missingPathDefault !== undefined) return missingPathDefault.evaluate()
    if (context.options.strictDataPaths)
      throw new OperatorFailure(`'${renderPath(path)}' is missing (strictDataPaths)`, {
        code: ErrorCodes.missingDataPath,
      })
    return null
  },
})

/** The path as the author spelled it, for the strict-mode message. */
const renderPath = (path: string | unknown[]): string =>
  typeof path === 'string' ? path : path.map((segment) => String(segment)).join('.')

export const buildObject = defineOperator({
  name: 'buildObject',
  category: 'data',
  description:
    'Assemble an object from computed key/value entries — for keys known only at runtime',
  parameters: {
    entries: {
      type: 'array',
      constraints: {
        // v2 silently filtered malformed entries away; the seam is kept
        // here instead — a missing key or value is a type error, and the
        // key's own type excludes null, so a null key rejects
        elementShape: {
          key: { type: ['string', 'number', 'boolean'] },
          value: { type: 'any' },
        },
      },
      description: 'Objects with a "key" and a "value"; a null value keeps its key',
    },
  },
  positionalParams: ['...entries'],
  returns: 'object',
  validate: (literalParams) => [
    ...emptyEntriesWarning(literalParams),
    ...duplicateKeyWarnings(literalParams),
  ],
  evaluate: ({ entries }, context) => {
    const built: Record<string, unknown> = {}
    for (const entry of entries as { key: string | number | boolean; value: unknown }[]) {
      // Keys take the canonical string form (`match`'s branch-key rule),
      // and a later entry wins — JS/JSON parity. Collisions under dynamic
      // keys are a data condition, so the seam is recorded, not raised
      const key = renderText(entry.key)
      if (Object.hasOwn(built, key)) context.trace.note({ type: 'key-overwrite', key })
      built[key] = entry.value
    }
    return built
  },
})

/** Literal entries colliding on a literal key: always the author's slip. */
const duplicateKeyWarnings = (literalParams: Record<string, unknown>) => {
  const entries = literalParams.entries
  if (!Array.isArray(entries)) return []
  const seen = new Set<string>()
  const reported = new Set<string>()
  const findings = []
  for (const entry of entries) {
    const key = (entry as { key?: unknown } | null)?.key
    if (typeof key !== 'string' && typeof key !== 'number' && typeof key !== 'boolean') continue
    const rendered = renderText(key)
    if (seen.has(rendered) && !reported.has(rendered)) {
      reported.add(rendered)
      findings.push({
        severity: 'warning' as const,
        parameter: 'entries',
        message: `duplicate key '${rendered}' — the last entry wins and the earlier one is dead`,
      })
    }
    seen.add(rendered)
  }
  return findings
}
