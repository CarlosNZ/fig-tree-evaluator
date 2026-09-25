/**
 * `fig-tree-evaluator/format` — converts a v3 expression between its forms
 * (docs-dev/v3-specs/v3-format.md). The engine never imports this. It reads
 * expressions as the compiler does, through the small root modules it shares
 * with the engine ("`./format`" in docs-dev/v3-specs/v3-packaging.md).
 *
 * TO-DO: the conversions themselves (Phase 16, chunks 3–5). Each placeholder
 * throws rather than returning its input, which would read as a successful
 * conversion.
 */
import type { CanonicalOptions, NameOptions, Registry, ShorthandOptions } from '../formatTypes'

const placeholder = (name: string): never => {
  throw new Error(`${name}: fig-tree-evaluator/format is a placeholder until Phase 16 builds it`)
}

/** Every node in the subtree to canonical form. */
export const toCanonical: (
  expression: unknown,
  fig: Registry,
  options?: CanonicalOptions
) => unknown = () => placeholder('toCanonical')

/** Every node in the subtree to shorthand form. */
export const toShorthand: (
  expression: unknown,
  fig: Registry,
  options?: ShorthandOptions
) => unknown = () => placeholder('toShorthand')

/** One reference string to a `get` node, or `null` if it has none. */
export const toGet: (
  reference: unknown,
  options?: NameOptions
) => Record<string, unknown> | null = () => placeholder('toGet')

/** One `get` node, in any form, to a reference, or `null` if it has none. */
export const toReference: (node: unknown, options?: NameOptions) => string | null = () =>
  placeholder('toReference')
