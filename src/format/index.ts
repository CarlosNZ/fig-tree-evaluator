/**
 * `fig-tree-evaluator/format` — converts a v3 expression between its forms
 * (docs-dev/v3-specs/v3-format.md). The engine never imports this. It reads
 * expressions as the compiler does, through the small root modules it shares
 * with the engine ("`./format`" in docs-dev/v3-specs/v3-packaging.md).
 *
 * TO-DO: `toShorthand` (Phase 16, chunk 5). Its placeholder throws rather
 * than returning its input, which would read as a successful conversion.
 */
import type { CanonicalOptions, NameOptions, Registry, ShorthandOptions } from '../formatTypes'
import { canonicalWriter } from './canonical'
import { buildLookup } from './read'
import { paramsToReference, readGetNode, referenceToGet } from './references'
import { Walk } from './walk'

const placeholder = (name: string): never => {
  throw new Error(`${name}: fig-tree-evaluator/format is a placeholder until Phase 16 builds it`)
}

/**
 * Every node in the subtree to canonical form. Throws a `FigTreeError` at a
 * node the compiler can't read.
 */
export const toCanonical = (
  expression: unknown,
  fig: Registry,
  options?: CanonicalOptions
): unknown => new Walk(buildLookup(fig), canonicalWriter(options)).value(expression)

/** Every node in the subtree to shorthand form. */
export const toShorthand: (
  expression: unknown,
  fig: Registry,
  options?: ShorthandOptions
) => unknown = () => placeholder('toShorthand')

/** One reference string to a `get` node, or `null` if it has none. */
export const toGet = (reference: unknown, options?: NameOptions): Record<string, unknown> | null =>
  referenceToGet(reference, options?.referenceNames ?? 'preserve')

/** One `get` node, in any form, to a reference, or `null` if it has none. */
export const toReference = (node: unknown, options?: NameOptions): string | null => {
  const params = readGetNode(node)
  return params === null ? null : paramsToReference(params, options?.referenceNames ?? 'preserve')
}
