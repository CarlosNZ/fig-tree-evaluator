/**
 * Reference resolution at evaluation ("References & scoping" in
 * docs-dev/v3-specs/v3-api.md). Phase 4 resolves `$data` only: bare → the
 * merged data object by reference; drilled → the shared path resolver, a
 * miss yielding `null` (absence is not failure) unless `strictDataPaths`
 * turns it into an ordinary, fallback-catchable runtime failure. `$vars`,
 * `$params`, `$element` and `$index` arrive with their scoping phases.
 */
import { FigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import { resolvePath } from '../primitives'
import type { ReferenceNode } from '../parse'
import type { EvaluationContext } from './context'
import { internalError } from './internal'

export const resolveReference = (node: ReferenceNode, ctx: EvaluationContext): unknown => {
  if (node.namespace !== 'data')
    throw internalError(`'${node.raw}': the $${node.namespace} namespace is not evaluable yet`)
  if (node.segments.length === 0) return ctx.data
  const result = resolvePath(ctx.data, node.segments)
  if (!result.found) {
    if (ctx.strictDataPaths)
      throw new FigTreeError({
        code: ErrorCodes.missingDataPath,
        message: `'${node.raw}' is absent from the evaluation data (strictDataPaths)`,
        path: node.path,
      })
    return null
  }
  // A stored undefined is not a value — JSON semantics at the read boundary
  return result.value === undefined ? null : result.value
}
